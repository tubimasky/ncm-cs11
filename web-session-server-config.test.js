'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')
var vm = require('node:vm')

var apiSource = fs.readFileSync(path.join(__dirname, 'web', 'api.js'), 'utf8')

function loadApi(storage, requests) {
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
    this.status = 200
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
    document: {
      createElement: function (tag) {
        assert.equal(tag, 'a')
        var anchor = { pathname: '/', search: '', hash: '', username: '', password: '' }
        Object.defineProperty(anchor, 'href', {
          set: function (value) {
            var parsed = new URL(value)
            anchor.protocol = parsed.protocol
            anchor.host = parsed.host
            anchor.pathname = parsed.pathname
            anchor.search = parsed.search
            anchor.hash = parsed.hash
            anchor.username = parsed.username
            anchor.password = parsed.password
          },
        })
        return anchor
      },
    },
    XMLHttpRequest: Xhr,
    window: {},
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

test('browser backend and gate key stay in memory and reset to the site origin', async function () {
  var storage = { ncm_gate_key: 'old-persisted-key' }
  var requests = []
  var api = loadApi(storage, requests)

  assert.equal(api.serverBase(), 'https://player.example')
  assert.equal(storage.ncm_gate_key, undefined, 'legacy persisted server key should be removed')

  api.setServerConfig('https://api.example.net/', 'temporary-secret')
  await api.qrKey()
  assert.equal(requests[0].url.split('/api/')[0], 'https://api.example.net')
  assert.equal(requests[0].headers['X-Gate-Key'], 'temporary-secret')
  assert.equal(storage.ncm_server_url, undefined)
  assert.equal(storage.ncm_gate_key, undefined)

  var afterReload = loadApi(storage, [])
  assert.equal(afterReload.serverBase(), 'https://player.example')
})

test('browser backend accepts only an origin URL', function () {
  var api = loadApi({}, [])
  assert.throws(function () { api.setServerConfig('https://user:pass@example.net', 'key') })
  assert.throws(function () { api.setServerConfig('https://api.example.net/api', 'key') })
  assert.throws(function () { api.setServerConfig('javascript:alert(1)', 'key') })
  assert.equal(api.serverBase(), 'https://player.example')
})
