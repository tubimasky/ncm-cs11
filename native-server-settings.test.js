'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')

test('server configuration is an APK-only control shown before the login QR', function () {
  var app = fs.readFileSync(path.join(__dirname, 'web', 'app.js'), 'utf8')
  var login = app.slice(app.indexOf('function renderLogin()'), app.indexOf('function startQr()'))
  var nativeGuard = login.indexOf('if (window.Android && window.Android.openServerDialog)')
  var settingsButton = login.indexOf("el('<button class=\"btn\" id=\"login-server\">服务器设置</button>')")
  var qrImage = login.indexOf("el('<img id=\"qr-img\"")

  assert.ok(nativeGuard >= 0, 'login settings button must require the APK bridge')
  assert.ok(settingsButton > nativeGuard, 'login settings button must be inside the APK-only branch')
  assert.ok(qrImage > settingsButton, 'server settings must appear before the QR code')
  assert.match(login, /serverButton\.onclick = function \(\) \{ window\.Android\.openServerDialog\(\) \}/)
  assert.doesNotMatch(app, /API\.setServerConfig/)
})
