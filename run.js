//[start] polyfills
Array.prototype.map = function (func) {
  var mut = []
  for (var i = 0; i < this.length; i++) {
	  mut[i] = func(this[i])
  }
  return mut
}

Array.prototype.reduce = function (func, initArg) {
	var acc = initArg
	for (var i = 0; i < this.length; i++) {
		acc = func(acc, this[i])
	}
	return acc
}
//[end] polyfills

//[start] COM initialization
var shell = WSH.CreateObject("WScript.Shell")
var fs = WSH.CreateObject("Scripting.FileSystemObject")
//[end] COM initialization

//[start] functional utils
var safeGetFile = function (error) {
  return function (success) {
    return function (filename) {
      try {
        return success(fs.GetFile(filename))
      } catch (e) {
        return error(null)
      }
    }
  }
}

var identity = function (i) { return i; }

var compose = function () {
  var fns = arguments
  return function (arg) {
    var acc = arg
	for (var i = 0; i < fns.length; i++) {
		acc = fns[i](acc)
	}
	return acc
  }
}

var die = function (message) {
  return function () {
    if (message) WSH.Echo(message)
    WSH.Quit()
  }
}

var createFile = function (filename) {
	return function () {
		fs.CreateTextFile(filename)
		return fs.GetFile(filename)
	}
}

var text = {}
text.encode = function (binstr) {
	var enc = binstr.split("").map(function (it) {
		var num = it.charCodeAt()
		num = num.toString(16)
		if (num.length === 1) num = "0" + num
		return num
	}).join("")
	return enc
}
text.decode = function (enc) {
	enc = enc.split("")
	var binstr = ""
	for (var i = 0; i < enc.length; i += 2) {
		var str = "0x" + enc[i] + enc[i + 1]
		binstr += String.fromCharCode(Number(str))
	}
	return binstr
}
//[end] functional utils

//[start] encryption interface
var cipher = {}

cipher.encrypt = function (message, key) {
  var messagetempStream = message.split("").map(function (it) { return it.charCodeAt() })
  var keytempStream = key.split("").map(function (it) { return it.charCodeAt() })
  var ciphertempStream = []
  
  for (var i = 0; i < messagetempStream.length; i++) {
	  ciphertempStream[i] = messagetempStream[i] ^ keytempStream[i % keytempStream.length]
  }
  return ciphertempStream.map(function (it) { return String.fromCharCode(it) }).join("")
}

cipher.decrypt = function (cipherText, key) {
  return cipher.encrypt(cipherText, key)
}
//[end] encryption utils

//everything below is business logic
var inputPassword = function () {
	//Update this routine to make it more secure
	var filename = "Enter Your Journal Password"
	var passFile = createFile(filename)()
	shell.Run('notepad "' + filename + '"', 5, true)
	var passtempStream = passFile.OpenAsTextStream(1, 0)
	var pass = passtempStream.ReadAll()
	passtempStream.Close()
	passFile.Delete()
	return pass
}
var createLock = function () {
	var pass = inputPassword()
	var lockedMessageArr = []
	for (var i = 0; i < 64; i++) {
		lockedMessageArr[i] = Math.floor(Math.random() * 256)
	}
	var lockedMessage = text.encode(lockedMessageArr.reduce(function (acc, it) { return acc + String.fromCharCode(it) }, ""))
	var lockedCipher = cipher.encrypt(lockedMessage, pass)
	var lock = createFile(lockName)()
	var lockStream = fs.OpenTextFile(lockName, 2)
	var lockData = text.encode(lockedCipher)
	lockStream.WriteLine(lockData)
	lockStream.WriteLine(lockedMessage)
	lockStream.Close()
	return pass
}
var verifyLock = function (lock) {
	var pass = inputPassword()
	var lockStream = lock.OpenAsTextStream(1, 0)
	var lockedCipher = text.decode(lockStream.ReadLine())
	var lockedMessage = lockStream.ReadLine()
	lockStream.Close()
	
	if (cipher.decrypt(lockedCipher, pass) === lockedMessage) {
		return pass
	}
	die("Password doesn't match")()
}
var lockName = "Journal.lock"

var pass = safeGetFile(createLock)(verifyLock)(lockName)



var getFileOrDie = safeGetFile(die("file doesn't exist"))(identity)
var months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
var temp = fs.GetSpecialFolder(2)
var date = new Date()
var tempFilename = temp + "\\journal_" + date.getTime().toString(16) + ".txt"
var entryDate = months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear()
var entryTime = date.getHours() + ":" + date.getMinutes()

var preWritten = entryDate
preWritten += ("\r\n" + entryTime)
var readEncFile = function (file) {
	var fileStream = file.OpenAsTextStream(1, 0)
	var cipherText = text.decode(fileStream.ReadAll())
	fileStream.Close()
	return cipher.decrypt(cipherText, pass)
}
var mutatePrewrite = function (message) {
	preWritten = message
	preWritten += ("\r\n" + entryTime)
	return fs.GetFile(entryFilename)
}
var entryFilename = entryDate + ".txt"
var entryFile = safeGetFile(createFile(entryFilename))(compose(readEncFile, mutatePrewrite))(entryFilename)

var tempFile = safeGetFile(createFile(tempFilename))(die("Try again in a bit. [temp file already exist.]"))(tempFilename)
var tempStream = tempFile.OpenAsTextStream(2, 0)
tempStream.WriteLine(preWritten)
tempStream.Close()

shell.Run("notepad " + tempFilename, 5, true)

tempStream = tempFile.OpenAsTextStream(1, 0)

var entryData = tempStream.ReadAll()
tempStream.Close()
tempFile.Delete(true)

var cipherText = text.encode(cipher.encrypt(entryData, pass))
var entryStream = entryFile.OpenAsTextStream(8, 0)
entryStream.Write(cipherText)
entryStream.Close()

WSH.Quit()