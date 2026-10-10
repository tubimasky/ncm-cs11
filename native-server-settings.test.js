'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')

test('APK server configuration remains native and Web has no server-switching UI', function () {
  var app = fs.readFileSync(path.join(__dirname, 'web', 'app.js'), 'utf8')
  var api = fs.readFileSync(path.join(__dirname, 'web', 'api.js'), 'utf8')
  var login = app.slice(app.indexOf('function renderLogin()'), app.indexOf('function startQr()'))
  var nativeGuard = login.indexOf('if (window.Android && window.Android.openServerDialog)')
  var qrImage = login.indexOf("el('<img id=\"qr-img\"")
  var settingsButton = login.indexOf("el('<button class=\"btn\" id=\"login-server\">服务器设置</button>')")
  var qrAppend = login.indexOf('wrap.appendChild(img); wrap.appendChild(status); wrap.appendChild(tip)')
  var settingsAppend = login.indexOf('wrap.appendChild(serverButton)')

  assert.ok(nativeGuard >= 0, 'APK login settings button must require the native bridge')
  assert.ok(settingsButton > nativeGuard, 'APK settings button must stay inside the native branch')
  assert.ok(qrImage >= 0 && settingsAppend > qrAppend, 'APK settings must be appended below the QR code')
  assert.match(login, /serverButton\.onclick = function \(\) \{ window\.Android\.openServerDialog\(\) \}/)
  assert.doesNotMatch(login, /连接其他后端|showWebServerDialog/)
  assert.doesNotMatch(app, /连接其他后端|showWebServerDialog|setServerConfig/)
  assert.match(app, /if \(window\.Android && window\.Android\.openServerDialog\) \{[\s\S]*?修改服务器地址/)
  assert.match(app, /qrGeneration/)
  assert.match(api, /location\.origin\.replace\(\/\\\/\$\/, ''\) \+ '\/api\/'/)
  assert.doesNotMatch(api, /setRequestHeader\(['"]X-Gate-Key/i)
  assert.doesNotMatch(api, /localStorage\.setItem\([^,]*(?:server|gate_key)/i)
})
