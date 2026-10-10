'use strict'

var assert = require('node:assert/strict')
var fs = require('node:fs')
var path = require('node:path')
var test = require('node:test')

var root = __dirname
var html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')
var app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8')

test('a persistent touch back control navigates through main and detail pages', function () {
  assert.match(html, /<button class="nav-back" id="nav-back"[^>]*aria-label="返回上一页"/)
  assert.match(app, /var maxPageHistory = 12/)
  assert.match(app, /function navigatePage\(id, view, render, replace\)/)
  assert.match(app, /function backPage\(\)/)
  assert.match(app, /document\.getElementById\('nav-back'\)\.onclick = backPage/)
  assert.match(app, /navigatePage\('recommend-songs', view/)
  assert.match(app, /navigatePage\('playlist:' \+ id, view/)
  assert.match(app, /navigatePage\('fm-playback', view, renderFmPlayer\)/)
  assert.match(app, /go\('recommend', true\)/)
})
