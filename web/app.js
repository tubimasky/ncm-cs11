// Car music app: views + HTML5 audio player. Native APK shell (phase 3) owns 方控/MediaSession
// and calls window.__bridge.onMediaKey(key) for play/pause/next/prev — see onMediaKey below.
'use strict'

var App = (function () {
  var audio = document.getElementById('audio')
  var state = {
    view: 'playlists',
    queue: [],        // [{id,name,ar,al,pic,url}]
    index: -1,
    mode: 'list',     // 'list' | 'fm'
    fmBuffer: [],
    quality: localStorage.getItem('ncm_quality') || 'exhigh',
  }
  var pageHistory = []
  var activePage = null
  var maxPageHistory = 12
  var debugCaptureTimer = null

  var ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12H16z"/></svg>'
  }
  function setPlayIcon(el, playing) { if (el) el.innerHTML = playing ? ICON.pause : ICON.play }
  function applySafeBottom() {
    var on = localStorage.getItem('ncm_safe_bottom_on') !== '0'
    var v = parseInt(localStorage.getItem('ncm_safe_bottom') || '20', 10)
    var safe = (on ? v : 0) + 'px'
    if (document.documentElement.style.setProperty) document.documentElement.style.setProperty('--safe-bottom', safe)
    document.getElementById('nav').style.paddingBottom = (14 + (on ? v : 0)) + 'px'
    document.getElementById('content').style.paddingBottom = (110 + (on ? v : 0)) + 'px'
    document.getElementById('player-bar').style.bottom = safe
  }
  function applyZoom() {
    var z = parseFloat(localStorage.getItem('ncm_zoom') || '1')
    document.documentElement.style.zoom = String(z)
  }

  function screenshotFeedbackAvailable() {
    if (!window.Android || !window.Android.captureScreenshot || !window.Android.supportsScreenshotFeedback) return false
    try { return window.Android.supportsScreenshotFeedback() } catch (error) { return false }
  }
  function debugEnabled() { return screenshotFeedbackAvailable() && localStorage.getItem('ncm_debug_on') === '1' }
  function applyDebugMode() {
    var button = document.getElementById('debug-shot')
    button.hidden = !debugEnabled()
  }

  function captureDebugScreenshot() {
    var button = document.getElementById('debug-shot')
    if (!window.Android || !window.Android.captureScreenshot) return
    button.hidden = true
    button.style.display = 'none'
    clearTimeout(debugCaptureTimer)
    debugCaptureTimer = setTimeout(function () {
      try {
        window.Android.captureScreenshot(state.view, localStorage.getItem('ncm_zoom') || '1')
      } catch (error) {
        window.__debugCaptureDone(false)
      }
    }, 120)
  }

  function eachNode(nodes, fn) {
    for (var i = 0; i < nodes.length; i++) fn(nodes[i], i)
  }

  function hasClass(node, name) {
    return new RegExp('(^|\\s)' + name + '(\\s|$)').test(node.className)
  }

  function toggleClass(node, name, enabled) {
    if (enabled && !hasClass(node, name)) node.className = (node.className + ' ' + name).replace(/^\s+|\s+$/g, '')
    if (!enabled && hasClass(node, name)) node.className = node.className.replace(new RegExp('(^|\\s)' + name + '(?=\\s|$)', 'g'), ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '')
  }

  function updateBackButton() {
    var button = document.getElementById('nav-back')
    if (!button) return
    var canGoBack = pageHistory.length > 0 || (API.isLogged() && state.view !== 'recommend')
    button.disabled = !canGoBack
  }

  function navigatePage(id, view, render, replace) {
    var content = document.getElementById('content')
    if (replace) pageHistory = []
    else if (activePage && activePage.id !== id) {
      activePage.scrollTop = content.scrollTop
      pageHistory.push(activePage)
      if (pageHistory.length > maxPageHistory) pageHistory.shift()
    }
    activePage = { id: id, view: view, render: render, scrollTop: 0 }
    state.view = view
    content.scrollTop = 0
    updateBackButton()
    render()
  }

  function backPage() {
    var previous = pageHistory.pop()
    if (previous) {
      activePage = previous
      state.view = previous.view
      eachNode(document.querySelectorAll('.nav-btn'), function (button) {
        toggleClass(button, 'active', button.getAttribute('data-view') === previous.view)
      })
      updateBackButton()
      previous.render()
      document.getElementById('content').scrollTop = previous.scrollTop || 0
      return
    }
    if (API.isLogged() && state.view !== 'recommend') {
      go('recommend', true)
      return
    }
    updateBackButton()
  }

  // ---------- utils ----------
  function fmt(s) { s = s || 0; var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild }
  function empty(n) { while (n.firstChild) n.removeChild(n.firstChild) }
  function textNode(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    node.textContent = text == null ? '' : String(text)
    return node
  }
  function imageNode(className, src) {
    var image = document.createElement('img')
    if (className) image.className = className
    image.alt = ''
    if (src) image.src = src
    return image
  }

  function trackArtist(t) {
    var a = t.ar || t.artists || []; return a.map(function (x) { return x.name || x }).join('/')
  }
  function trackName(t) { return t.name || (t.al && t.al.name) || '-' }
  function trackPic(t) {
    var p = t.al && t.al.picUrl; if (p) return API.httpsPic(p)
    p = t.album && t.album.picUrl; if (p) return API.httpsPic(p)
    p = t.picUrl; return p ? API.httpsPic(p) : ''
  }

  // ---------- routing ----------
  function go(view, replace) {
    navigatePage('view:' + view, view, function () {
      applyDebugMode()
      eachNode(document.querySelectorAll('.nav-btn'), function (b) {
        toggleClass(b, 'active', b.getAttribute('data-view') === view)
      })
      if (view === 'login') return renderLogin()
      if (!API.isLogged()) { return renderLogin() }
      if (view === 'nowplaying') renderNowPlaying()
      else if (view === 'recommend') renderRecommendations()
      else if (view === 'playlists') renderPlaylists()
      else if (view === 'fm') renderFm()
      else if (view === 'search') renderSearch()
      else if (view === 'settings') renderSettings()
    }, replace)
  }

  // ---------- login (QR) ----------
  var qrTimer = null
  var qrGeneration = 0
  function renderLogin() {
    clearInterval(qrTimer)
    var generation = ++qrGeneration
    var c = document.getElementById('content')
    empty(c)
    c.appendChild(el('<h2>登录网易云音乐</h2>'))
    var wrap = el('<div class="login-wrap"></div>')
    var serverButton
    if (window.Android && window.Android.openServerDialog) {
      serverButton = el('<button class="btn" id="login-server">服务器设置</button>')
      serverButton.onclick = function () { window.Android.openServerDialog() }
    }
    var img = el('<img id="qr-img" alt="二维码">')
    var status = el('<div id="qr-status">生成二维码中…</div>')
    var tip = el('<div class="login-tip">打开手机网易云音乐 App → 扫一扫，确认登录。无需输入密码。</div>')
    wrap.appendChild(img); wrap.appendChild(status); wrap.appendChild(tip)
    if (serverButton) wrap.appendChild(serverButton)
    c.appendChild(wrap)
    if (API.isLogged()) {
      status.textContent = '已登录，正在获取信息…'
      img.style.display = 'none'; tip.style.display = 'none'
      API.loginStatus().then(function (r) {
        if (generation !== qrGeneration) return
        var p = r.data && r.data.profile
        if (p) { API.saveProfile(p.userId, p.nickname, p.avatarUrl); updateLoginBtn(); go('recommend', true) }
        else { status.textContent = '凭证已失效，请重新扫码'; API.clearAuth(); startQr(generation) }
      }).catch(function () { if (generation === qrGeneration) status.textContent = '获取信息失败，请重试' })
      return
    }
    startQr(generation)
  }

  function startQr(generation) {
    if (generation === undefined) generation = ++qrGeneration
    var img = document.getElementById('qr-img')
    var status = document.getElementById('qr-status')
    API.qrKey().then(function (r) {
      if (generation !== qrGeneration) return
      var key = r.data && r.data.unikey
      if (!key) throw new Error(r.message || '接口未返回二维码凭证')
      return API.qrCreate(key).then(function (r2) {
        if (generation !== qrGeneration) return
        if (!r2.data || !r2.data.qrimg) throw new Error(r2.message || '接口未返回二维码图片')
        img.src = r2.data.qrimg
        status.textContent = '请用手机网易云 App 扫码'
        pollQr(key, generation)
      })
    }).catch(function (e) {
      if (generation === qrGeneration) status.textContent = '生成失败：' + e.message
    })
  }

  function pollQr(key, generation) {
    clearInterval(qrTimer)
    var status = document.getElementById('qr-status')
    qrTimer = setInterval(function () {
      API.qrCheck(key).then(function (r) {
        if (generation !== qrGeneration) return
        var code = r.code
        if (code === 801) status.textContent = '请用手机网易云 App 扫码'
        else if (code === 802) status.textContent = '已扫码，请在手机确认'
        else if (code === 800) { status.textContent = '二维码过期，重新生成'; clearInterval(qrTimer); startQr(generation) }
        else if (code === 803) {
          status.textContent = '登录成功，正在读取账户…'
          clearInterval(qrTimer)
          if (r.cookie) API.setCookie(r.cookie)   // 803 body.cookie = Set-Cookie 拼接，必须存
          API.loginStatus().then(function (s) {
            if (generation !== qrGeneration) return
            var p = s.data && s.data.profile
            if (p) { API.saveProfile(p.userId, p.nickname, p.avatarUrl); updateLoginBtn(); go('recommend', true) }
            else { status.textContent = '已授权但未取到账户，点左侧「歌单」重试' }
          }).catch(function (e) { if (generation === qrGeneration) status.textContent = '读取账户失败：' + e.message })
        }
      }).catch(function () {})
    }, 2000)
  }

  function updateLoginBtn() {
    var b = document.getElementById('nav-login')
    if (API.isLogged() && API.avatar()) {
      empty(b)
      b.appendChild(imageNode('nav-avatar', API.avatar()))
    } else {
      b.textContent = API.isLogged() ? '已登录' : '未登录'
    }
  }

  function playlistCard(playlist) {
    var card = el('<div class="card"></div>')
    card.appendChild(imageNode('', API.httpsPic(playlist.coverImgUrl || playlist.picUrl)))
    var info = el('<div class="c-info"></div>')
    info.appendChild(textNode('div', 'c-name', playlist.name))
    var playCount = playlist.playCount || playlist.playcount
    info.appendChild(textNode('div', 'c-cnt', playCount
      ? Math.round(playCount / 10000) + '万播放'
      : (playlist.trackCount || 0) + ' 首'))
    card.appendChild(info)
    card.onclick = function () { renderPlaylistDetail(playlist.id, playlist.name) }
    return card
  }

  function personalFmCard() {
    var card = el('<div class="card fm-card"></div>')
    card.appendChild(el('<div class="fm-card-cover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.24 6.15C2.6 6.04 2 6.52 2 7.17V19c0 1.1.9 2 2 2h16c1.11 0 2-.9 2-2V7c0-1.1-.9-2-2-2H8.44l7.64-2.83L15.41 1 3.24 6.15zM7 19c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V7h16v4z"/></svg></div>'))
    var info = el('<div class="c-info"></div>')
    info.appendChild(textNode('div', 'c-name', '私人 FM'))
    info.appendChild(textNode('div', 'c-cnt', '为你连续推荐'))
    card.appendChild(info)
    card.onclick = startFm
    return card
  }

  // ---------- daily recommendations ----------
  function renderRecommendationSongs(songs) {
    var view = state.view
    navigatePage('recommend-songs', view, function () {
      renderRecommendationSongPage(songs)
    })
  }

  function renderRecommendationSongPage(songs) {
    var c = document.getElementById('content'); empty(c)
    var heading = el('<div class="recommend-detail-heading"><h2>每日推荐歌曲</h2></div>')
    c.appendChild(heading)
    var songsNode = el('<div class="list" id="rec-songs"></div>')
    c.appendChild(songsNode)
    songs.forEach(function (song, index) {
      var row = el('<div class="row"></div>')
      row.appendChild(textNode('div', 'idx', index + 1))
      var cover = trackPic(song)
      if (cover) {
        var coverImage = imageNode('cv', cover)
        coverImage.setAttribute('loading', 'lazy')
        row.appendChild(coverImage)
      } else row.appendChild(el('<div class="cv"></div>'))
      var info = el('<div class="rec-song-info"></div>')
      info.appendChild(textNode('div', 'ttl', trackName(song)))
      info.appendChild(textNode('div', 'art', trackArtist(song)))
      row.appendChild(info)
      row.onclick = function () { state.mode = 'list'; playQueue(songs, index) }
      songsNode.appendChild(row)
    })
  }

  function renderRecommendations() {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>每日推荐</h2>'))
    var songsSection = el('<section class="recommend-section"><div class="recommend-daily-entry" id="rec-daily-entry" role="button" tabindex="0" aria-label="打开每日推荐歌曲列表"><img class="rec-daily-cover" alt=""><div class="rec-daily-info"><div class="rec-daily-title">每日推荐</div><div class="rec-daily-track">加载中…</div><div class="rec-daily-count"></div></div><button class="rec-daily-play" id="rec-play-all" type="button" aria-label="播放每日推荐" title="播放每日推荐" disabled></button></div></section>')
    var playlistsSection = el('<section class="recommend-section"><div class="recommend-heading"><h3>推荐歌单</h3><button class="btn" id="rec-refresh">换一换</button></div><div class="grid" id="rec-playlists"></div></section>')
    c.appendChild(songsSection)
    c.appendChild(playlistsSection)

    var dailyEntry = document.getElementById('rec-daily-entry')
    var dailyCover = dailyEntry.querySelector('.rec-daily-cover')
    var dailyTrack = dailyEntry.querySelector('.rec-daily-track')
    var dailyCount = dailyEntry.querySelector('.rec-daily-count')
    var playlistsNode = document.getElementById('rec-playlists')
    var playAll = document.getElementById('rec-play-all')
    var songs = []
    var generation = 0

    function load(refresh) {
      var current = ++generation
      playAll.disabled = true
      dailyCover.removeAttribute('src')
      dailyTrack.textContent = '加载中…'
      dailyCount.textContent = ''
      empty(playlistsNode)
      playlistsNode.appendChild(el('<div class="loading">加载中…</div>'))

      API.recommendSongs(refresh).then(function (result) {
        if (current !== generation || document.getElementById('rec-daily-entry') !== dailyEntry) return
        if (result.code && result.code !== 200) throw new Error(result.message || '每日推荐暂不可用')
        var data = result.data || {}
        songs = data.dailySongs || result.dailySongs || []
        if (!songs.length) {
          dailyTrack.textContent = result.message || '暂无推荐歌曲'
          return
        }
        var firstCover = trackPic(songs[0])
        if (firstCover) {
          dailyCover.src = firstCover
          dailyCover.style.visibility = 'visible'
        } else {
          dailyCover.removeAttribute('src')
          dailyCover.style.visibility = 'hidden'
        }
        dailyTrack.textContent = trackName(songs[0])
        var firstArtist = trackArtist(songs[0])
        dailyCount.textContent = firstArtist
          ? firstArtist + ' · ' + songs.length + ' 首歌曲'
          : songs.length + ' 首歌曲'
        playAll.disabled = false
      }).catch(function (error) {
        if (current !== generation || document.getElementById('rec-daily-entry') !== dailyEntry) return
        dailyTrack.textContent = '推荐歌曲加载失败：' + error.message
      })

      API.recommendResource().then(function (result) {
        if (current !== generation || document.getElementById('rec-playlists') !== playlistsNode) return
        if (result.code && result.code !== 200) throw new Error(result.message || '每日推荐暂不可用')
        var playlists = result.recommend || (result.data && result.data.recommend) || []
        empty(playlistsNode)
        if (!playlists.length) {
          playlistsNode.appendChild(textNode('div', 'empty', result.message || '暂无每日推荐歌单'))
          return
        }
        playlists.forEach(function (playlist) { playlistsNode.appendChild(playlistCard(playlist)) })
      }).catch(function (error) {
        if (current !== generation || document.getElementById('rec-playlists') !== playlistsNode) return
        empty(playlistsNode)
        playlistsNode.appendChild(textNode('div', 'empty', '推荐歌单加载失败：' + error.message))
      })
    }

    dailyEntry.onclick = function () {
      if (songs.length) renderRecommendationSongs(songs)
    }
    dailyEntry.onkeydown = function (event) {
      if (event.target !== dailyEntry || (event.keyCode !== 13 && event.keyCode !== 32)) return
      event.preventDefault()
      if (songs.length) renderRecommendationSongs(songs)
    }
    playAll.innerHTML = ICON.play
    playAll.onclick = function (event) {
      event.stopPropagation()
      if (songs.length) { state.mode = 'list'; playQueue(songs, 0) }
    }
    document.getElementById('rec-refresh').onclick = function () { load(true) }
    load(false)
  }

  // ---------- playlists ----------
  function renderPlaylists() {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>我的歌单</h2>'))
    c.appendChild(el('<div class="loading" id="pl-load">加载中…</div>'))
    API.userPlaylist(API.uid()).then(function (r) {
      var list = r.playlist || []
      var load = document.getElementById('pl-load'); if (load) load.remove()
      if (!list.length) { c.appendChild(el('<div class="empty">没有歌单</div>')); return }
      var grid = el('<div class="grid"></div>')
      list.forEach(function (pl) {
        grid.appendChild(playlistCard(pl))
      })
      c.appendChild(grid)
    }).catch(function (e) {
      var load = document.getElementById('pl-load')
      if (load) load.textContent = '加载失败：' + e.message
    })
  }

  function renderPlaylistDetail(id, name) {
    var view = state.view
    navigatePage('playlist:' + id, view, function () {
      renderPlaylistDetailPage(id, name)
    })
  }

  function renderPlaylistDetailPage(id, name) {
    var c = document.getElementById('content'); empty(c)
    var page = el('<div class="playlist-detail-page"></div>')
    page.appendChild(textNode('h2', '', name))
    page.appendChild(el('<div class="loading" id="pd-load">加载中…</div>'))
    c.appendChild(page)
    API.playlistTracks(id).then(function (r) {
      if (!page.parentNode) return
      var songs = r.songs || []
      var load = page.querySelector('#pd-load'); if (load) load.remove()
      var playAll = el('<button class="btn" style="margin-bottom:12px">' + ICON.play + ' 播放全部</button>')
      page.appendChild(playAll)
      var list = el('<div class="list"></div>')
      songs.forEach(function (s, i) {
        var row = el('<div class="row"></div>')
        row.appendChild(textNode('div', 'idx', i + 1))
        row.appendChild(trackPic(s) ? imageNode('cv', trackPic(s)) : el('<div class="cv"></div>'))
        var m = el('<div style="flex:1;min-width:0"></div>')
        m.appendChild(textNode('div', 'ttl', trackName(s)))
        m.appendChild(textNode('div', 'art', trackArtist(s)))
        row.appendChild(m)
        row.onclick = function () { state.mode = 'list'; playQueue(songs, i) }
        list.appendChild(row)
      })
      page.appendChild(list)
      playAll.onclick = function () { if (songs.length) { state.mode = 'list'; playQueue(songs, 0) } }
    }).catch(function (e) {
      if (!page.parentNode) return
      var load = page.querySelector('#pd-load')
      if (load) load.textContent = '加载失败：' + e.message
    })
  }

  // ---------- search ----------
  function renderSearch() {
    var c = document.getElementById('content'); empty(c)
    var bar = el('<div class="search-bar"><input id="skw" placeholder="搜索歌曲/歌手"><button id="sgo">搜索</button></div>')
    c.appendChild(bar)
    var resHead = el('<h2 id="res-head" style="display:none;margin:20px 0 14px">搜索结果</h2>')
    c.appendChild(resHead)
    var results = el('<div class="list" id="sres"></div>')
    c.appendChild(results)
    function doSearch() {
      var kw = document.getElementById('skw').value.trim()
      if (!kw) return
      var rh = document.getElementById('res-head'); if (rh) rh.style.display = 'block'
      empty(results); results.appendChild(el('<div class="loading">搜索中…</div>'))
      API.search(kw).then(function (r) {
        var songs = (r.result && r.result.songs) || []
        empty(results)
        if (!songs.length) { results.appendChild(el('<div class="empty">无结果</div>')); return }
        songs.forEach(function (s, i) {
          var row = el('<div class="row"></div>')
          row.appendChild(textNode('div', 'idx', i + 1))
          var m = el('<div style="flex:1;min-width:0"></div>')
          m.appendChild(textNode('div', 'ttl', s.name))
          m.appendChild(textNode('div', 'art', (s.artists || []).map(function (a) { return a.name }).join('/')))
          row.appendChild(m)
          row.onclick = function () { state.mode = 'list'; playQueue(songs, i) }
          results.appendChild(row)
        })
      }).catch(function (e) { empty(results); results.appendChild(textNode('div', 'empty', e.message)) })
    }
    document.getElementById('sgo').onclick = doSearch
    document.getElementById('skw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch() })
  }

  // ---------- private FM ----------
  function renderFm() {
    var c = document.getElementById('content'); empty(c)
    var head = el('<div class="section-head"><h2>推荐歌单</h2><button id="fm-refresh" class="btn">换一换</button></div>')
    var grid = el('<div class="grid" id="fm-grid"></div>')
    c.appendChild(head)
    c.appendChild(grid)

    function loadRecommendations() {
      empty(grid)
      grid.appendChild(personalFmCard())
      grid.appendChild(el('<div class="loading fm-loading">加载中…</div>'))
      API.topPlaylist(Math.floor(Math.random() * 200), 11).then(function (response) {
        var playlists = response.playlists || []
        empty(grid)
        grid.appendChild(personalFmCard())
        playlists.forEach(function (playlist) { grid.appendChild(playlistCard(playlist)) })
      }).catch(function () {
        empty(grid)
        grid.appendChild(personalFmCard())
        grid.appendChild(el('<div class="empty fm-loading">加载失败，点换一换重试</div>'))
      })
    }

    document.getElementById('fm-refresh').onclick = loadRecommendations
    loadRecommendations()
  }
  function startFm() {
    var view = state.view
    navigatePage('fm-playback', view, renderFmPlayer)
  }

  function renderFmPlayer() {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>私人 FM</h2>'))
    c.appendChild(el('<div class="loading" id="fm-load">加载中…</div>'))
    state.mode = 'fm'
    API.personalFm().then(function (r) {
      var data = r.data || []
      state.fmBuffer = data.slice()
      var load = document.getElementById('fm-load'); if (load) load.remove()
      if (!data.length) { c.appendChild(el('<div class="empty">没有推荐，稍后再试</div>')); return }
      playFromFm()
    }).catch(function (e) {
      var load = document.getElementById('fm-load')
      if (load) load.textContent = '加载失败：' + e.message
    })
  }

  function playFromFm() {
    if (!state.fmBuffer.length) {
      API.personalFm().then(function (r) { (r.data || []).forEach(function (x) { state.fmBuffer.push(x) }); if (state.fmBuffer.length) playFromFm() })
      return
    }
    var t = state.fmBuffer.shift()
    state.queue = [t]; state.index = 0; state.mode = 'fm'
    playTrack(t)
  }

  // ---------- playback core ----------
  function playQueue(songs, i) {
    state.queue = songs.slice(); state.index = i
    playTrack(state.queue[i])
  }

  function notifyMedia(t) { if (window.Android) try { window.Android.setMedia(trackName(t), trackArtist(t), trackPic(t)) } catch (e) {} }

  function ensureCover(t) {
    API.songDetail(t.id).then(function (r) {
      var s = r.songs && r.songs[0]
      if (s && s.al && s.al.picUrl) {
        t.al = s.al
        if (cur() === t) {
          var cv = document.getElementById('pb-cover'); if (cv) { cv.src = trackPic(t); cv.style.visibility = 'visible' }
          var ncv = document.getElementById('np-cover'); if (ncv) { ncv.src = trackPic(t); ncv.style.visibility = 'visible' }
          notifyMedia(t)
        }
      }
    }).catch(function () {})
  }

  // ---------- next-track URL prefetch ----------
  // song/url direct links live ~20min (expi:1200). Prefetch the next track's URL right
  // after the current one starts, so 切歌 (方控/按钮/自动连播) hits the cache and starts
  // instantly instead of paying the cross-ocean round trip every time.
  var urlCache = {}            // id -> {url|dead, q, ts} | {pending}
  var URL_TTL = 15 * 60 * 1000
  var DEAD_TTL = 60 * 1000
  var fmFetching = false

  function cacheHit(id) {
    var e = urlCache[id]
    if (!e || e.pending || e.q !== state.quality) return null
    if (e.dead) return Date.now() - e.ts <= DEAD_TTL ? e : null
    return Date.now() - e.ts <= URL_TTL ? e : null
  }

  function ensureFmBuffer() {
    if (fmFetching || state.fmBuffer.length >= 2) return
    fmFetching = true
    API.personalFm().then(function (r) {
      (r.data || []).forEach(function (x) { state.fmBuffer.push(x) })
    }).catch(function () {}).then(function () { fmFetching = false })
  }

  function prefetchNextUrl() {
    var nt = null
    if (state.mode === 'fm') { ensureFmBuffer(); nt = state.fmBuffer[0] }
    else nt = state.queue[state.index + 1]
    if (!nt || !nt.id || cacheHit(nt.id)) return
    var e = urlCache[nt.id]
    if (e && e.pending && Date.now() - e.ts < 30000) return   // fetch in flight
    urlCache[nt.id] = { pending: true, ts: Date.now() }
    API.songUrl(nt.id, state.quality).then(function (r) {
      var d = r.data && r.data[0]
      if (d && d.url) {
        urlCache[nt.id] = { url: d.url, q: state.quality, ts: Date.now() }
        preloadNextAudio(d.url, nt.id, state.quality)   // 整首提前下到 WebView 缓存，切歌秒开
      }
      else urlCache[nt.id] = { dead: true, q: state.quality, ts: Date.now() }   // 无版权/VIP：短缓存，连跳免等
    }).catch(function () { delete urlCache[nt.id] })
  }

  // ---------- next-track AUDIO preloading ----------
  // URL prefetch only kills the API round trip; on slow 4G the song still buffers at switch.
  // A hidden <audio preload="auto"> downloads the whole next file into the WebView HTTP cache
  // while the current one plays; the main element then reads the same URL from local cache.
  // Cache hit = instant start; cache miss = same as before (no downside).
  var preloader = null
  var preloaded = null   // {url, id, q}
  function ensurePreloader() {
    if (preloader) return preloader
    preloader = document.createElement('audio')
    preloader.preload = 'auto'
    preloader.style.display = 'none'
    document.body.appendChild(preloader)
    return preloader
  }
  function preloadNextAudio(url, id, q) {
    if (preloaded && preloaded.url === url) return
    preloaded = { url: url, id: id, q: q }
    var pre = ensurePreloader()
    pre.pause()
    pre.src = url
    pre.load()
  }
  function dropPreloadedAudio() {
    if (!preloader) return
    preloaded = null
    try {
      preloader.pause()
      preloader.removeAttribute('src')
      preloader.load()   // abort any in-flight download
    } catch (e) {}
  }

  function playTrack(t) {
    if (!t || !t.id) return
    showBarLoading(t)
    var hit = cacheHit(t.id)
    if (hit) return startTrack(t, hit)
    API.songUrl(t.id, state.quality).then(function (r) {
      var d = r.data && r.data[0]
      startTrack(t, d && d.url ? { url: d.url, q: state.quality, ts: Date.now() } : { dead: true, q: state.quality, ts: Date.now() })
    }).catch(function () { next() })
  }

  function startTrack(t, e) {
    urlCache[t.id] = e          // remember (prev/replay reuse it within TTL)
    recoverCount = 0            // fresh track: reset the error-recovery budget
    if (!e.url) { next(); return }  // 无版权/VIP，跳下一首（解灰已由后端尝试）
    lastPos = 0
    audio.src = e.url
    var playResult = audio.play()
    if (playResult && playResult.catch) playResult.catch(function () {})
    updateBar(t)
    notifyMedia(t)
    if (state.view === 'nowplaying') renderNowPlaying()   // 切歌时刷新当前播放视图（标题/封面/歌词）
    if (!trackPic(t)) ensureCover(t)   // 搜索/FM 等接口不带封面，按需补取
    prefetchNextUrl()           // warm the next track while this one plays
  }

  // ---------- audio error self-healing + buffering indicator ----------
  // Song URLs expire (~20min). A long pause or a mid-song network drop used to leave the
  // player dead-silent with no retry. On error: refetch a fresh URL, restore the position,
  // keep playing. 'waiting' shows 缓冲… in the time slot; timeupdate restores it naturally.
  var recoverCount = 0
  var lastPos = 0
  function bindAudioHealth() {
    audio.addEventListener('error', function () {
      var t = cur()
      if (!t || !t.id || recoverCount >= 2) {
        document.getElementById('pb-cur').textContent = '播放失败'
        return
      }
      recoverCount++
      var resumeAt = lastPos
      document.getElementById('pb-cur').textContent = '重连中…'
      delete urlCache[t.id]   // force a fresh URL (the old one expired / broke)
      API.songUrl(t.id, state.quality).then(function (r) {
        var d = r.data && r.data[0]
        if (!d || !d.url) throw new Error('no url')
        urlCache[t.id] = { url: d.url, q: state.quality, ts: Date.now() }
        audio.src = d.url
        audio.addEventListener('loadedmetadata', function restore() {
          audio.removeEventListener('loadedmetadata', restore)
          try { if (resumeAt > 0 && resumeAt < (audio.duration || 0)) audio.currentTime = resumeAt } catch (e) {}
          var pr = audio.play()
          if (pr && pr.catch) pr.catch(function () {})
        })
        var pr2 = audio.play()   // some old WebViews only fire loadedmetadata after play()
        if (pr2 && pr2.catch) pr2.catch(function () {})
      }).catch(function () {
        document.getElementById('pb-cur').textContent = '播放失败'
      })
    })
    audio.addEventListener('waiting', function () {
      document.getElementById('pb-cur').textContent = '缓冲…'
    })
    audio.addEventListener('stalled', function () {
      document.getElementById('pb-cur').textContent = '缓冲…'
    })
    audio.addEventListener('playing', function () {
      document.getElementById('pb-cur').textContent = fmt(audio.currentTime)
    })
    audio.addEventListener('ended', function () { recoverCount = 0 })
  }

  function cur() { return state.index >= 0 ? state.queue[state.index] : null }

  function next() {
    if (state.mode === 'fm') return playFromFm()
    if (state.index < state.queue.length - 1) { state.index++; playTrack(state.queue[state.index]) }
    else { audio.pause(); updateBar(null) }
  }
  function prev() {
    if (state.mode === 'fm') return
    if (audio.currentTime > 3) { audio.currentTime = 0; return }
    if (state.index > 0) { state.index--; playTrack(state.queue[state.index]) }
  }
  function toggle() { if (audio.paused) audio.play(); else audio.pause() }

  // ---------- UI sync ----------
  function setBarCover(t) {
    var cv = document.getElementById('pb-cover'); if (!cv) return
    var pic = trackPic(t)
    if (pic) { cv.src = pic; cv.style.visibility = 'visible' }
    else { cv.removeAttribute('src'); cv.style.visibility = 'hidden' }
  }
  function showBarLoading(t) {
    var bar = document.getElementById('player-bar'); bar.hidden = false
    document.getElementById('pb-title').textContent = trackName(t)
    document.getElementById('pb-artist').textContent = trackArtist(t)
    setBarCover(t)
  }
  function updateBar(t) {
    var bar = document.getElementById('player-bar'); bar.hidden = false
    if (!t) { document.getElementById('pb-title').textContent = '-'; return }
    document.getElementById('pb-title').textContent = trackName(t)
    document.getElementById('pb-artist').textContent = trackArtist(t)
    setBarCover(t)
  }

  function loadLyric(id) {
    API.lyric(id).then(function (r) {
      var lrc = r.lrc && r.lrc.lyric
      var box = document.getElementById('np-lyric')
      if (!lrc || !box) return
      var lines = Lrc.parse(lrc)
      box._lines = lines
      box._active = -1
      empty(box)
      lines.forEach(function (ln, i) {
        var d = textNode('div', '', ln.text || '…')
        d.setAttribute('data-i', i)
        box.appendChild(d)
      })
    }).catch(function () {})
  }

  // ---------- now playing view (routed, fills the content area) ----------
  function renderNowPlaying() {
    var c = document.getElementById('content'); empty(c)
    var t = cur()
    if (!t) { c.appendChild(el('<h2>当前播放</h2>')); c.appendChild(el('<div class="empty">没有正在播放的曲目，去歌单点一首吧</div>')); return }
    var view = el('<div class="np-view"><div class="np-left"><img id="np-cover" alt=""><div class="np-times"><span id="np-cur">0:00</span><span id="np-dur">0:00</span></div><input id="np-seek" type="range" min="0" max="1000" value="0"><div class="np-controls"><button id="np-prev" class="ctrl big"></button><button id="np-play" class="ctrl big"></button><button id="np-next" class="ctrl big"></button></div></div><div class="np-right"><div class="np-head"><div id="np-title"></div><div id="np-artist"></div></div><div id="np-lyric" class="np-lyric"></div></div></div>')
    c.appendChild(view)
    var ncv = document.getElementById('np-cover'); var npic = trackPic(t)
    if (npic) { ncv.src = npic; ncv.style.visibility = 'visible' } else { ncv.removeAttribute('src'); ncv.style.visibility = 'hidden' }
    document.getElementById('np-title').textContent = trackName(t)
    document.getElementById('np-artist').textContent = trackArtist(t)
    setPlayIcon(document.getElementById('np-play'), !audio.paused)
    document.getElementById('np-prev').innerHTML = ICON.prev
    document.getElementById('np-next').innerHTML = ICON.next
    if (audio.duration) {
      document.getElementById('np-seek').value = String((audio.currentTime / audio.duration) * 1000)
      document.getElementById('np-cur').textContent = fmt(audio.currentTime)
      document.getElementById('np-dur').textContent = fmt(audio.duration)
    }
    document.getElementById('np-play').onclick = toggle
    document.getElementById('np-next').onclick = next
    document.getElementById('np-prev').onclick = prev
    document.getElementById('np-seek').oninput = function (e) { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration }
    loadLyric(t.id)
    syncLyric()
  }

  // ---------- bindings ----------
  function bind() {
    bindAudioHealth()
    eachNode(document.querySelectorAll('.nav-btn'), function (b) {
      b.onclick = function () { go(b.getAttribute('data-view')) }
    })
    document.getElementById('nav-back').onclick = backPage
    document.getElementById('nav-login').onclick = function () { go(API.isLogged() ? 'settings' : 'login') }
    document.getElementById('pb-play').onclick = toggle
    document.getElementById('pb-next').onclick = next
    document.getElementById('pb-prev').onclick = prev
    document.getElementById('pb-info').onclick = function () { go('nowplaying') }
    document.getElementById('pb-cover').onclick = function () { go('nowplaying') }
    document.getElementById('debug-shot').onclick = captureDebugScreenshot

    audio.addEventListener('play', function () {
      setPlayIcon(document.getElementById('pb-play'), true)
      var np = document.getElementById('np-play'); setPlayIcon(np, true)
      if (window.Android) try { window.Android.setPlaying(true) } catch (e) {}
    })
    audio.addEventListener('pause', function () {
      setPlayIcon(document.getElementById('pb-play'), false)
      var np = document.getElementById('np-play'); setPlayIcon(np, false)
      if (window.Android) try { window.Android.setPlaying(false) } catch (e) {}
    })
    audio.addEventListener('ended', next)
    audio.addEventListener('timeupdate', function () {
      lastPos = audio.currentTime
      var cur = fmt(audio.currentTime), dur = fmt(audio.duration)
      document.getElementById('pb-cur').textContent = cur
      document.getElementById('pb-dur').textContent = dur
      var npcur = document.getElementById('np-cur'), npdur = document.getElementById('np-dur')
      if (npcur) npcur.textContent = cur
      if (npdur) npdur.textContent = dur
      var seek = document.getElementById('np-seek')
      if (seek && audio.duration) seek.value = String((audio.currentTime / audio.duration) * 1000)
      var pbf = document.getElementById('pb-fill')
      if (pbf && audio.duration) pbf.style.width = (audio.currentTime / audio.duration * 100) + '%'
      syncLyric()
    })

    // keyboard (dev convenience)
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return
      var code = e.code || e.key || e.keyCode
      if (code === 'Space' || code === ' ' || code === 32) { e.preventDefault(); toggle() }
      else if (code === 'ArrowRight' || code === 39) next()
      else if (code === 'ArrowLeft' || code === 37) prev()
    })
  }

  function syncLyric() {
    var box = document.getElementById('np-lyric'); if (!box || !box._lines) return
    var t = audio.currentTime, lines = box._lines, active = -1
    for (var i = 0; i < lines.length; i++) { if (lines[i].t <= t) active = i; else break }
    if (active === box._active) return
    box._active = active
    Array.prototype.forEach.call(box.children, function (d, i) { d.className = i === active ? 'cur' : '' })
    if (active >= 0 && box.children[active]) {
      var line = box.children[active]
      var target = line.offsetTop - (box.clientHeight - line.offsetHeight) / 2
      box.scrollTop = Math.max(0, target)
    }
  }

  // ---------- settings ----------
  function renderSettings() {
    var c = document.getElementById('content'); empty(c)
    c.appendChild(el('<h2>设置</h2>'))
    if (window.Android && window.Android.openServerDialog) {
      var serverLabel = location.origin
      var gateSet = false
      if (window.Android.getServer) {
        try { serverLabel = window.Android.getServer() } catch (e) {}
      }
      if (window.Android.hasGateKey) {
        try { gateSet = !!window.Android.hasGateKey() } catch (e) {}
      }
      var srvRow = el('<div class="set-row"><div>服务器地址</div><div class="server-value"></div></div>')
      srvRow.lastChild.textContent = serverLabel
      c.appendChild(srvRow)
      c.appendChild(el('<div class="set-row"><div>访问口令</div><div class="server-value">' + (gateSet ? '已设置' : '未设置') + '</div></div>'))
      var srvBtn = el('<button class="btn" style="margin:0 0 16px">修改服务器地址</button>')
      c.appendChild(srvBtn)
      srvBtn.onclick = function () { window.Android.openServerDialog() }
    }
    var qRow = el('<div class="set-row"><div>音质</div><select id="q-sel">' +
      '<option value="standard">标准</option><option value="higher">较高</option>' +
      '<option value="exhigh">极高</option><option value="lossless">无损 (VIP)</option>' +
      '<option value="hires">Hi-Res (VIP)</option></select></div>')
    c.appendChild(qRow)
    var sel = document.getElementById('q-sel'); sel.value = state.quality
    sel.onchange = function () { state.quality = sel.value; localStorage.setItem('ncm_quality', sel.value); dropPreloadedAudio() }
    var safeOn = localStorage.getItem('ncm_safe_bottom_on') !== '0'
    var safeCur = parseInt(localStorage.getItem('ncm_safe_bottom') || '20', 10)
    var safeRow = el('<div class="set-row" style="flex-direction:column;align-items:stretch;gap:12px"><div style="display:flex;align-items:center;justify-content:space-between"><div>底部留白 <span class="muted">避开车机底栏</span></div><button id="safe-toggle" class="btn">' + (safeOn ? '已开' : '已关') + '</button></div><div id="safe-adj" style="display:flex;align-items:center;gap:12px"><button id="safe-minus" class="btn">-10</button><span id="safe-val" style="min-width:54px;text-align:center">' + safeCur + ' px</span><button id="safe-plus" class="btn">+10</button></div></div>')
    c.appendChild(safeRow)
    function renderSafe() { var on = localStorage.getItem('ncm_safe_bottom_on') !== '0'; document.getElementById('safe-toggle').textContent = on ? '已开' : '已关'; document.getElementById('safe-adj').style.display = on ? 'flex' : 'none'; document.getElementById('safe-val').textContent = (parseInt(localStorage.getItem('ncm_safe_bottom') || '20', 10)) + ' px' }
    document.getElementById('safe-adj').style.display = safeOn ? 'flex' : 'none'
    document.getElementById('safe-toggle').onclick = function () { localStorage.setItem('ncm_safe_bottom_on', localStorage.getItem('ncm_safe_bottom_on') === '0' ? '1' : '0'); applySafeBottom(); renderSafe() }
    document.getElementById('safe-minus').onclick = function () { localStorage.setItem('ncm_safe_bottom', String(Math.max(0, parseInt(localStorage.getItem('ncm_safe_bottom') || '20', 10) - 10))); applySafeBottom(); renderSafe() }
    document.getElementById('safe-plus').onclick = function () { localStorage.setItem('ncm_safe_bottom', String(parseInt(localStorage.getItem('ncm_safe_bottom') || '20', 10) + 10)); applySafeBottom(); renderSafe() }
    var zoomCur = parseFloat(localStorage.getItem('ncm_zoom') || '1')
    var zoomRow = el('<div class="set-row"><div>界面缩放</div><div style="display:flex;align-items:center;gap:12px"><button id="zoom-minus" class="btn">-10%</button><span id="zoom-val" style="min-width:64px;text-align:center">' + Math.round(zoomCur * 100) + '%</span><button id="zoom-plus" class="btn">+10%</button></div></div>')
    c.appendChild(zoomRow)
    function renderZoom() { document.getElementById('zoom-val').textContent = Math.round(parseFloat(localStorage.getItem('ncm_zoom') || '1') * 100) + '%' }
    document.getElementById('zoom-minus').onclick = function () { localStorage.setItem('ncm_zoom', (parseFloat(localStorage.getItem('ncm_zoom') || '1') - 0.1).toFixed(2)); applyZoom(); renderZoom() }
    document.getElementById('zoom-plus').onclick = function () { localStorage.setItem('ncm_zoom', (parseFloat(localStorage.getItem('ncm_zoom') || '1') + 0.1).toFixed(2)); applyZoom(); renderZoom() }
    if (screenshotFeedbackAvailable()) {
      var debugOn = debugEnabled()
      var debugRow = el('<div class="set-row"><div><div>Debug 模式</div><div class="muted">在每个页面显示截图上传按钮</div></div><button id="debug-toggle" class="btn">' + (debugOn ? '已开' : '已关') + '</button></div>')
      c.appendChild(debugRow)
      document.getElementById('debug-toggle').onclick = function () {
        localStorage.setItem('ncm_debug_on', debugEnabled() ? '0' : '1')
        this.textContent = debugEnabled() ? '已开' : '已关'
        applyDebugMode()
      }
    }
    var acct = el('<div class="set-row"><div class="acct"><img src=""></div>' +
      '<div><div id="set-name"></div><div id="set-uid" class="muted"></div></div>' +
      '<button class="btn" id="logout">退出登录</button></div>')
    c.appendChild(acct)
    document.getElementById('set-name').textContent = API.name() || '已登录'
    document.getElementById('set-uid').textContent = 'UID: ' + API.uid()
    API.loginStatus().then(function (r) {
      var p = r.data && r.data.profile
      if (p) { API.saveProfile(p.userId, p.nickname, p.avatarUrl); document.getElementById('set-name').textContent = p.nickname }
      var img = acct.querySelector('img'); img.src = p && p.avatarUrl ? API.httpsPic(p.avatarUrl) : ''
    })
    document.getElementById('logout').onclick = function () { API.clearAuth(); updateLoginBtn(); go('login', true) }
    c.appendChild(el('<div class="muted" style="margin-top:12px">后端：NeteaseCloudMusicApi Enhanced v4.40.1，经 /api 同源代理。音质受账号会员与版权限制，无版权歌曲由后端解灰自动尝试。</div>'))
  }

  // ---------- bridge for native APK shell (phase 3) ----------
  window.__bridge = {
    onMediaKey: function (key) {
      if (key === 'play' || key === 'pause') toggle()
      else if (key === 'next') next()
      else if (key === 'prev') prev()
    },
    getState: function () {
      var t = cur()
      return JSON.stringify({ playing: !audio.paused, title: t ? trackName(t) : '', artist: t ? trackArtist(t) : '', pic: t ? trackPic(t) : '' })
    },
  }
  window.__debugCaptureDone = function () {
    clearTimeout(debugCaptureTimer)
    document.getElementById('debug-shot').style.display = ''
    applyDebugMode()
  }

  // ---------- init ----------
  function init() {
    applySafeBottom()
    applyZoom()
    applyDebugMode()
    bind(); updateLoginBtn()
    if (API.isLogged()) {
      API.loginStatus().then(function (r) {
        var p = r.data && r.data.profile
        if (p) API.saveProfile(p.userId, p.nickname, p.avatarUrl)
        updateLoginBtn()
        go(p ? 'recommend' : 'login', true)
      }).catch(function () { go('login', true) })
    } else go('login', true)
  }

  return { init: init }
})()

// tiny LRC parser
var Lrc = (function () {
  function parse(text) {
    var out = [], re = /\[(\d+):(\d+(?:\.\d+)?)\]/g
    text.split(/\r?\n/).forEach(function (line) {
      var m, base = 0, tags = []
      re.lastIndex = 0
      while ((m = re.exec(line))) { tags.push(parseInt(m[1], 10) * 60 + parseFloat(m[2])) }
      var txt = line.replace(re, '').replace(/[‘’＇]/g, "'").replace(/[“”＂]/g, '"')
      tags.forEach(function (t) { out.push({ t: t, text: txt }) })
    })
    out.sort(function (a, b) { return a.t - b.t })
    return out
  }
  return { parse: parse }
})()
