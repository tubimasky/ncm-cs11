'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')
var vm = require('node:vm')

function loadApi(initialStorage) {
  var values = new Map(Object.entries(initialStorage || {}))
  var requests = []
  var context = {
    location: { origin: 'https://player.test', search: '' },
    localStorage: {
      getItem: function (key) { return values.has(key) ? values.get(key) : null },
      setItem: function (key, value) { values.set(key, String(value)) },
    },
    window: {},
    XMLHttpRequest: function () {
      this.headers = {}
      this.open = function (method, url) { this.method = method; this.url = url }
      this.setRequestHeader = function (key, value) { this.headers[key] = value }
      this.send = function () {
        requests.push(this)
        this.responseText = '{}'
        this.onload()
      }
    },
  }
  var source = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8')
  vm.runInNewContext(source, context)
  return { api: context.API, requests: requests, values: values }
}

test('login API defaults to the page origin and can switch backend before login', async function () {
  var loaded = loadApi()
  assert.equal(loaded.api.serverBase(), 'https://player.test')

  assert.equal(loaded.api.setServerConfig(' https://api.test/api/ ', 'gate secret'), true)
  assert.equal(loaded.api.serverBase(), 'https://api.test')
  assert.equal(loaded.api.gateKey(), 'gate secret')

  await loaded.api.qrKey()
  assert.equal(loaded.requests[0].url.split('?')[0], 'https://api.test/api/login/qr/key')
  assert.equal(loaded.requests[0].headers['X-Gate-Key'], 'gate secret')
})

test('server configuration rejects invalid URLs without replacing a valid backend', function () {
  var loaded = loadApi()
  assert.equal(loaded.api.setServerConfig('https://api.test', 'key'), true)
  assert.equal(loaded.api.setServerConfig('javascript:alert(1)', 'other'), false)
  assert.equal(loaded.api.setServerConfig('https://api.test?key=secret', 'other'), false)
  assert.equal(loaded.api.serverBase(), 'https://api.test')
  assert.equal(loaded.api.gateKey(), 'key')
})

test('gate-page password is available as the initial API access key', function () {
  var loaded = loadApi({ ncm_gk: 'gate-page-key' })
  assert.equal(loaded.api.gateKey(), 'gate-page-key')
})

test('login page server button opens the shared browser/native configuration flow', function () {
  var app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')
  assert.match(app, /serverButton\.onclick = openServerSettings/)
  assert.match(app, /window\.Android\.openServerDialog\(\)/)
  assert.match(app, /API\.setServerConfig\(urlInput\.value, keyInput\.value\)/)
})
