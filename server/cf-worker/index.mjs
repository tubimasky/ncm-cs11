import { handleNeteaseApi } from './ncm-api.mjs'

const GATE_PAGE = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#101014">
<title>访问验证 · ncm-cs11</title>
<style>
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{background:#101014;color:#f2f2f5;font-family:-apple-system,"HarmonyOS Sans","Microsoft YaHei","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
button,input{font:inherit}
.gate{min-height:100vh;display:flex;flex-direction:column;padding:28px 6vw}
.brand{display:flex;align-items:center}
.brand-mark{width:46px;height:46px;border-radius:12px;background:#e32931;display:flex;align-items:center;justify-content:center}
.brand-mark i{display:block;width:4px;border-radius:3px;background:#fff;margin:0 2px}
.brand-mark i:nth-child(1){height:12px}.brand-mark i:nth-child(2){height:23px}.brand-mark i:nth-child(3){height:16px}.brand-mark i:nth-child(4){height:27px}
.brand-copy{margin-left:12px}
.brand-name{font-size:17px;font-weight:700}
.brand-note{margin-top:3px;color:#858590;font-size:10px}
.layout{width:100%;max-width:980px;margin:auto;display:flex;align-items:center}
.intro{flex:1;padding:30px 56px 30px 0}
.eyebrow{color:#ef7075;font-size:12px;font-weight:700}
.eyebrow:before{content:"";display:inline-block;width:7px;height:7px;margin:0 9px 1px 0;border-radius:50%;background:#49c7b2}
h1{margin:20px 0 14px;font-size:40px;line-height:1.28;font-weight:700}
h1 span{color:#ec4141}
.intro-copy{max-width:390px;color:#92929d;font-size:16px;line-height:1.8}
.intro-rule{width:42px;height:3px;margin-top:30px;background:#ec4141}
.panel{width:390px;flex:none;padding:30px;background:#18181e;border:1px solid #2d2d36;border-radius:8px}
.panel-tag{color:#81818d;font-size:11px;font-weight:700}
h2{margin:12px 0 6px;font-size:25px;line-height:1.35}
.panel-copy{margin:0 0 25px;color:#92929d;font-size:14px;line-height:1.6}
label{display:block;margin-bottom:9px;color:#c9c9d0;font-size:14px;font-weight:600}
.field{display:flex;align-items:center;height:54px;border:1px solid #373741;border-radius:8px;background:#101014}
.field:focus-within{border-color:#ec4141}
.field input{width:100%;min-width:0;height:100%;padding:0 14px;border:0;outline:0;background:transparent;color:#f2f2f5;font-size:16px}
.field input::placeholder{color:#62626e}
.toggle{flex:none;margin-right:6px;padding:9px 10px;border:0;border-radius:6px;background:transparent;color:#aaaab4;font-size:13px;cursor:pointer}
.toggle:active{color:#fff;background:#2a2a33}
.message{min-height:28px;padding-top:8px;color:#f0787c;font-size:13px;line-height:1.5}
.submit{width:100%;height:52px;border:0;border-radius:8px;background:#e32931;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
.submit:active{background:#c82029}
.submit span{padding-left:8px;font-size:20px;vertical-align:-1px}
.footnote{margin:17px 0 0;color:#70707c;font-size:12px;text-align:center}
.footer{display:flex;justify-content:space-between;color:#666671;font-size:11px}
@media(max-width:700px){.gate{padding:22px 20px}.layout{display:block;max-width:420px}.intro{padding:28px 0 22px}h1{margin:13px 0 8px;font-size:30px}.intro-copy{font-size:14px}.intro-rule{display:none}.panel{width:100%;padding:24px}.footer{margin-top:28px}}
@media(max-height:620px){.gate{padding-top:16px;padding-bottom:16px}.intro{padding-top:12px;padding-bottom:14px}h1{margin-top:12px;font-size:32px}.intro-rule{margin-top:18px}.panel{padding:22px}.panel-copy{margin-bottom:16px}}
</style></head><body><div class="gate">
<header class="brand"><div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div class="brand-copy"><div class="brand-name">NCM CS11</div><div class="brand-note">CAR MUSIC PLAYER</div></div></header>
<main class="layout"><section class="intro"><div class="eyebrow">PRIVATE MUSIC PLAYER</div>
<h1>音乐继续，<br><span>从这里开始。</span></h1>
<p class="intro-copy">这是一个受保护的音乐空间。验证访问口令后，即可继续使用播放器。</p>
<div class="intro-rule"></div></section>
<section class="panel" aria-labelledby="gate-title"><div class="panel-tag">SECURE ACCESS</div>
<h2 id="gate-title">访问验证</h2><p class="panel-copy" id="hint">请输入访问口令以继续</p>
<form id="gate-form"><label for="k">访问口令</label>
<div class="field"><input id="k" name="password" type="password" placeholder="输入口令" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" autofocus>
<button class="toggle" id="toggle-key" type="button" aria-label="显示访问口令">显示</button></div>
<div class="message" id="err" role="status" aria-live="polite"></div>
<button class="submit" id="go" type="submit">继续使用<span aria-hidden="true">›</span></button></form>
<p class="footnote">访问口令由服务管理员提供</p></section></main>
<footer class="footer"><span>NCM CS11</span><span>PRIVATE ACCESS</span></footer></div>
<script>(function () {
var hint = document.getElementById('hint'), input = document.getElementById('k');
var error = document.getElementById('err'), form = document.getElementById('gate-form');
var toggle = document.getElementById('toggle-key');
try {
  if (localStorage.getItem('ncm_gk')) {
    hint.textContent = '保存的口令未通过验证，请重新输入';
    localStorage.removeItem('ncm_gk');
    document.cookie = 'ncm_gate=; Path=/; Max-Age=0';
  }
} catch (e) {}
form.addEventListener('submit', function (event) {
  event.preventDefault();
  var value = input.value.trim();
  if (!value) {
    error.textContent = '请输入访问口令';
    input.focus();
    return;
  }
  try { localStorage.setItem('ncm_gk', value) } catch (e) {}
  document.cookie = 'ncm_gate=' + encodeURIComponent(value) + '; Path=/; Max-Age=31536000';
  location.replace('/');
});
toggle.addEventListener('click', function () {
  var visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? '隐藏' : '显示';
  toggle.setAttribute('aria-label', visible ? '隐藏访问口令' : '显示访问口令');
});
})()</script></body></html>`

const API_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'X-Gate-Key, Content-Type',
  'access-control-max-age': '86400',
}

function withApiCors(response) {
  const headers = new Headers(response.headers)
  Object.keys(API_CORS_HEADERS).forEach((name) => headers.set(name, API_CORS_HEADERS[name]))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function decodeCookie(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function gateKey(request, url) {
  const header = request.headers.get('x-gate-key')
  if (header) return header

  const queryKey = url.searchParams.get('gate_key')
  if (queryKey !== null) return queryKey

  const cookie = request.headers.get('cookie') || ''
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== 'ncm_gate') continue
    return decodeCookie(part.slice(separator + 1).trim())
  }

  if (!url.pathname.startsWith('/api/')) return url.searchParams.get('key') || ''
  return ''
}

function safeEqual(actual, expected) {
  const left = new TextEncoder().encode(actual)
  const right = new TextEncoder().encode(expected)
  let mismatch = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] || 0) ^ (right[index] || 0)
  }
  return mismatch === 0
}

function deny(request) {
  if (new URL(request.url).pathname.startsWith('/api/')) {
    return new Response('{"code":403,"message":"gate denied"}', {
      status: 403,
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'cache-control': 'no-store',
        ...API_CORS_HEADERS,
      },
    })
  }
  return new Response(GATE_PAGE, {
    status: 403,
    headers: {
      'content-type': 'text/html;charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function serveAsset(request, env) {
  const assetUrl = new URL(request.url)
  const requestedAsset = assetUrl.searchParams.get('__ncm_asset')
  if (requestedAsset !== null) {
    const segments = requestedAsset.split('/')
    if (!/^[A-Za-z0-9._/-]+$/.test(requestedAsset)
      || requestedAsset.startsWith('/')
      || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      return new Response('bad asset path', { status: 400 })
    }
    assetUrl.pathname = `/${requestedAsset}`
    assetUrl.search = ''
    request = new Request(assetUrl, request)
  }

  const response = await env.ASSETS.fetch(request)
  const pathname = assetUrl.pathname
  if (!/\.(?:html|js|css)$/i.test(pathname)) return response

  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url)
    const isApiRequest = requestUrl.pathname.startsWith('/api/')
    if (isApiRequest && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: API_CORS_HEADERS })
    }
    const configuredKey = env.GATE_KEY || ''
    if (!configuredKey) {
      const response = new Response('GATE_KEY is not configured', {
        status: 503,
        headers: { 'content-type': 'text/plain;charset=utf-8', 'cache-control': 'no-store' },
      })
      return isApiRequest ? withApiCors(response) : response
    }
    if (!safeEqual(gateKey(request, requestUrl), configuredKey)) {
      return deny(request)
    }

    if (requestUrl.pathname.startsWith('/debug/screenshot')) {
      return new Response('{"ok":false,"error":"not found"}', {
        status: 404,
        headers: {
          'content-type': 'application/json;charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    }

    if (isApiRequest) {
      return withApiCors(await handleNeteaseApi(requestUrl))
    }

    return serveAsset(request, env)
  },
}
