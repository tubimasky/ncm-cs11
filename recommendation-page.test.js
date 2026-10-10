'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')

var root = __dirname
var html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')
var app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8')
var api = fs.readFileSync(path.join(root, 'web', 'api.js'), 'utf8')
var worker = fs.readFileSync(path.join(root, 'server', 'cf-worker', 'ncm-api.mjs'), 'utf8')
var docs = fs.readFileSync(path.join(root, 'server', 'CF_WORKERS.md'), 'utf8')

test('daily recommendation page is a first-class player view', function () {
  assert.match(html, /data-view="recommend"[^>]*>推荐/)
  assert.match(app, /else if \(view === 'recommend'\) renderRecommendations\(\)/)
  assert.match(app, /function renderRecommendations\(\)/)
  assert.match(app, /API\.recommendSongs\(refresh\)/)
  assert.match(app, /API\.recommendResource\(\)/)
  assert.match(app, /playQueue\(songs, index\)/)
  assert.match(app, /id="rec-play-all"/)
  assert.match(api, /recommendResource: function \(\) \{ return call\('recommend\/resource'\) \}/)
  assert.match(api, /recommendSongs: function \(afresh\) \{ return call\('recommend\/songs'/)
})

test('Worker and deployment docs expose both upstream daily recommendation APIs', function () {
  assert.match(worker, /route === 'recommend\/resource'/)
  assert.match(worker, /\/api\/v1\/discovery\/recommend\/resource/)
  assert.match(worker, /route === 'recommend\/songs'/)
  assert.match(worker, /\/api\/v3\/discovery\/recommend\/songs/)
  assert.match(worker, /params\.afresh = query\.afresh/)
  assert.match(docs, /\/api\/recommend\/resource/)
  assert.match(docs, /\/api\/recommend\/songs/)
})
