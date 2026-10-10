'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')

test('APK server configuration remains native while Web configuration is session-only', function () {
  var app = fs.readFileSync(path.join(__dirname, 'web', 'app.js'), 'utf8')
  var api = fs.readFileSync(path.join(__dirname, 'web', 'api.js'), 'utf8')
  var login = app.slice(app.indexOf('function renderLogin()'), app.indexOf('function startQr()'))
  var nativeGuard = login.indexOf('if (window.Android && window.Android.openServerDialog)')
  var settingsButton = login.indexOf("el('<button class=\"btn\" id=\"login-server\">服务器设置</button>')")
  var qrImage = login.indexOf("el('<img id=\"qr-img\"")

  assert.ok(nativeGuard >= 0, 'APK login settings button must require the native bridge')
  assert.ok(settingsButton > nativeGuard, 'APK settings button must stay inside the native branch')
  assert.ok(qrImage > settingsButton, 'APK settings must appear before the QR code')
  assert.match(login, /serverButton\.onclick = function \(\) \{ window\.Android\.openServerDialog\(\) \}/)
  assert.match(login, /webServerButton\.onclick = showWebServerDialog/)
  assert.match(app, /API\.setServerConfig\(urlInput\.value, keyInput\.value\)/)
  assert.match(app, /qrGeneration/)
  assert.match(api, /var server = defaultServer/)
  assert.match(api, /var gateKey = ''/)
  assert.doesNotMatch(api, /localStorage\.setItem\([^,]*(?:server|gate_key)/i)
})
