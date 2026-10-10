'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')
var vm = require('node:vm')

var apiSource = fs.readFileSync(path.join(__dirname, 'web', 'api.js'), 'utf8')

function loadApi(storage, requests, android) {
  function Xhr() {
    this.headers = {}
    requests.push(this)
  }
  Xhr.prototype.open = function (method, url) {
    this.method = method
    this.url = url
  }
  Xhr.prototype.setRequestHeader = function (name, value) {
    this.headers[name] = value
  }
  Xhr.prototype.send = function () {
    this.status = requests.length === 1 && android ? 403 : 200
    this.responseText = '{}'
    this.onload()
  }

  var context = {
    location: { origin: 'https://player.example', search: '' },
    localStorage: {
      getItem: function (key) { return storage[key] || null },
      setItem: function (key, value) { storage[key] = String(value) },
      removeItem: function (key) { delete storage[key] },
    },
    XMLHttpRequest: Xhr,
    window: android ? { Android: android } : {},
    URL: URL,
    Promise: Promise,
    Date: Date,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    Object: Object,
    String: String,
    Error: Error,
  }
  vm.createContext(context)
  vm.runInContext(apiSource, context)
  return context.API
}

test('browser API stays on the page origin and does not send a cross-origin gate header', async function () {
  var storage = { ncm_gate_key: 'old-persisted-key' }
  var requests = []
  var api = loadApi(storage, requests)

  assert.equal(api.serverBase(), 'https://player.example')
  assert.equal(storage.ncm_gate_key, undefined, 'legacy persisted server key should be removed')

  await api.qrKey()
  assert.match(requests[0].url, /^https:\/\/player\.example\/api\/login\/qr\/key\?/)
  assert.equal(requests[0].headers['X-Gate-Key'], undefined)
  assert.equal(typeof api.setServerConfig, 'undefined')
  assert.equal(storage.ncm_server_url, undefined)
  assert.equal(storage.ncm_gate_key, undefined)

  var afterReload = loadApi(storage, [])
  assert.equal(afterReload.serverBase(), 'https://player.example')
})

test('APK gate-cookie resync remains available after an authorization failure', async function () {
  var requests = []
  var resyncCount = 0
  var api = loadApi({}, requests, {
    resyncGateCookie: function () { resyncCount++ },
  })

  await api.qrKey()
  assert.equal(requests.length, 2)
  assert.equal(resyncCount, 1)
  assert.ok(requests.every(function (request) {
    return request.url.indexOf('https://player.example/api/') === 0
  }))
})
