import CryptoJS from 'crypto-js'
import forge from 'node-forge'
import qrcode from 'qrcode-generator'

const EAPI_DOMAIN = 'https://interfacepc.music.163.com'
const WEAPI_DOMAIN = 'https://music.163.com'
const EAPI_KEY = 'e82ckenh8dichen8'
const WEAPI_IV = '0102030405060708'
const WEAPI_PRESET_KEY = '0CoJUm6Qyw8W8jud'
const WEAPI_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const EAPI_USER_AGENT = 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)'
const WEAPI_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'
let deviceId

const osDefaults = {
  pc: {
    os: 'pc',
    appver: '3.1.17.204416',
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    channel: 'netease',
  },
  android: { os: 'android', appver: '8.20.20.231215173437', osver: '14', channel: 'xiaomi' },
  iphone: { os: 'iPhone OS', appver: '9.0.90', osver: '16.2', channel: 'distribution' },
}

const rsaPublicKey = forge.pki.publicKeyFromPem(WEAPI_PUBLIC_KEY)

function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getDeviceId() {
  if (!deviceId) deviceId = randomHex(26).toUpperCase()
  return deviceId
}

function randomBase62(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => BASE62[byte % BASE62.length]).join('')
}

function parseCookie(value = '') {
  const cookie = {}
  for (const part of value.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const key = part.slice(0, index).trim()
    const content = part.slice(index + 1).trim()
    if (key) cookie[key] = content
  }
  return cookie
}

function processCookie(input, apiPath) {
  const cookie = { ...input }
  const defaults = osDefaults[cookie.os] || osDefaults.pc
  cookie.__remember_me = 'true'
  cookie.ntes_kaola_ad = '1'
  cookie._ntes_nuid ||= randomHex(16)
  cookie._ntes_nnid ||= `${cookie._ntes_nuid},${Date.now()}`
  cookie.WNMCID ||= `${randomBase62(6)}.${Date.now()}.01.0`
  cookie.WEVNSM ||= '1.0.0'
  cookie.osver ||= defaults.osver
  cookie.deviceId ||= getDeviceId()
  cookie.os ||= defaults.os
  cookie.channel ||= defaults.channel
  cookie.appver ||= defaults.appver
  if (!apiPath.includes('login')) cookie.NMTID ||= randomHex(8)
  return cookie
}

function apiHeader(cookie) {
  const defaults = osDefaults[cookie.os] || osDefaults.pc
  const header = {
    osver: cookie.osver,
    deviceId: cookie.deviceId,
    os: cookie.os,
    appver: cookie.appver,
    versioncode: cookie.versioncode || '140',
    mobilename: cookie.mobilename || '',
    buildver: cookie.buildver || String(Math.floor(Date.now() / 1000)),
    resolution: cookie.resolution || '1920x1080',
    __csrf: cookie.__csrf || '',
    channel: cookie.channel || defaults.channel,
    requestId: `${Date.now()}_${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
  }
  if (cookie.MUSIC_U) header.MUSIC_U = cookie.MUSIC_U
  if (cookie.MUSIC_A) header.MUSIC_A = cookie.MUSIC_A
  return header
}

function serializeCookie(cookie) {
  return Object.entries(cookie)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('; ')
}

function encryptAes(text, key, mode, iv) {
  const options = { mode, padding: CryptoJS.pad.Pkcs7 }
  if (iv) options.iv = CryptoJS.enc.Utf8.parse(iv)
  return CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(text),
    CryptoJS.enc.Utf8.parse(key),
    options,
  )
}

function eapiForm(apiPath, data) {
  const text = JSON.stringify(data)
  const digest = CryptoJS.MD5(`nobody${apiPath}use${text}md5forencrypt`).toString()
  const plaintext = `${apiPath}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  const encrypted = encryptAes(plaintext, EAPI_KEY, CryptoJS.mode.ECB)
  return new URLSearchParams({
    params: encrypted.ciphertext.toString().toUpperCase(),
  })
}

function weapiForm(data) {
  const secret = randomBase62(16)
  const first = encryptAes(JSON.stringify(data), WEAPI_PRESET_KEY, CryptoJS.mode.CBC, WEAPI_IV).toString()
  const params = encryptAes(first, secret, CryptoJS.mode.CBC, WEAPI_IV).toString()
  const rsa = rsaPublicKey.encrypt(secret.split('').reverse().join(''), 'NONE')
  return new URLSearchParams({
    params,
    encSecKey: forge.util.bytesToHex(rsa),
  })
}

function randomChinaIp() {
  return `116.${Math.floor(Math.random() * 70) + 25}.${Math.floor(Math.random() * 255) + 1}.${Math.floor(Math.random() * 255) + 1}`
}

function setCookieValues(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie') || '']
  return values.flatMap((value) => value.split(/,(?=\s*[^;,=\s]+\s*=)/))
}

async function postNetease(apiPath, data, cookieString, mode = 'eapi') {
  const cookie = processCookie(parseCookie(cookieString), apiPath)
  const headers = new Headers({
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': mode === 'weapi' ? WEAPI_USER_AGENT : EAPI_USER_AGENT,
    'x-real-ip': randomChinaIp(),
  })

  let url
  let form
  data.e_r = false
  if (mode === 'weapi') {
    data.csrf_token = cookie.__csrf || ''
    url = `${WEAPI_DOMAIN}/weapi/${apiPath.replace(/^\/api\//, '')}`
    headers.set('referer', `${WEAPI_DOMAIN}/`)
    headers.set('cookie', serializeCookie(cookie))
    form = weapiForm(data)
  } else {
    const eapiPath = `/api/${apiPath.replace(/^\/api\//, '')}`
    data.header = apiHeader(cookie)
    headers.set('cookie', serializeCookie(data.header))
    url = `${EAPI_DOMAIN}/eapi/${apiPath.replace(/^\/api\//, '')}`
    form = eapiForm(eapiPath, data)
  }

  headers.set('x-forwarded-for', headers.get('x-real-ip'))
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
    redirect: 'manual',
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`网易云接口返回非 JSON（HTTP ${response.status}）`)
  }
  if (!response.ok && ![201, 302, 400, 502, 800, 801, 802, 803].includes(body.code)) {
    throw new Error(`网易云接口请求失败（HTTP ${response.status}）`)
  }
  return { body, cookies: setCookieValues(response.headers) }
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json;charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function loginCookies(body, cookies) {
  const values = cookies.map((value) => value.split(';')[0].trim()).filter(Boolean)
  if (values.length && !body.cookie) body.cookie = values.join('; ')
  return body
}

function qrImage(url) {
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  return `data:image/svg+xml;base64,${btoa(qr.createSvgTag(4, 4))}`
}

function numericIds(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 1000)
}

export function likePayload(query) {
  const ids = numericIds(query.id)
  if (!ids.length) return null
  return {
    alg: 'itembased',
    trackId: ids[0],
    like: query.like !== 'false',
    time: '3',
  }
}

export async function handleNeteaseApi(requestUrl) {
  const route = requestUrl.pathname.slice('/api/'.length).replace(/\/+$/, '')
  const query = Object.fromEntries(requestUrl.searchParams)
  delete query.gate_key
  const cookie = query.cookie || ''

  try {
    if (route === 'login/qr/key') {
      const result = await postNetease('/api/login/qrcode/unikey', { type: 3 }, cookie)
      return response(loginCookies({ data: result.body, code: 200 }, result.cookies))
    }

    if (route === 'login/qr/create') {
      const qrurl = `https://music.163.com/login?codekey=${encodeURIComponent(query.key || '')}`
      return response({
        code: 200,
        data: { qrurl, qrimg: query.qrimg ? qrImage(qrurl) : '' },
      })
    }

    if (route === 'login/qr/check') {
      const result = await postNetease('/api/login/qrcode/client/login', {
        key: query.key || '',
        type: 3,
      }, cookie)
      return response(loginCookies(result.body, result.cookies))
    }

    if (route === 'login/status') {
      const result = await postNetease('/api/w/nuser/account/get', {}, cookie, 'weapi')
      if (result.body.code === 200) return response({ data: result.body })
      return response(result.body)
    }

    if (route === 'user/playlist') {
      const result = await postNetease('/api/user/playlist', {
        uid: query.uid || '',
        limit: query.limit || 30,
        offset: query.offset || 0,
        includeVideo: true,
      }, cookie, 'weapi')
      return response(result.body)
    }

    if (route === 'recommend/resource') {
      const result = await postNetease('/api/v1/discovery/recommend/resource', {}, cookie, 'weapi')
      return response(result.body)
    }

    if (route === 'recommend/songs') {
      const params = {}
      if (query.afresh !== undefined) params.afresh = query.afresh
      const result = await postNetease('/api/v3/discovery/recommend/songs', params, cookie, 'weapi')
      return response(result.body)
    }

    if (route === 'likelist') {
      const result = await postNetease('/api/song/like/get', {
        uid: query.uid || '',
      }, cookie)
      return response(result.body)
    }

    if (route === 'like') {
      const payload = likePayload(query)
      if (!payload) return response({ code: 400, message: 'id is required' }, 400)
      const result = await postNetease('/api/radio/like', payload, cookie, 'weapi')
      return response(result.body)
    }

    if (route === 'playlist/track/all') {
      const playlist = await postNetease('/api/v6/playlist/detail', {
        id: query.id || '',
        n: 100000,
        s: 8,
      }, cookie)
      const tracks = playlist.body.playlist?.trackIds || []
      const offset = Math.max(0, Number.parseInt(query.offset || '0', 10) || 0)
      const limit = Math.min(1000, Math.max(1, Number.parseInt(query.limit || '1000', 10) || 1000))
      const ids = tracks.slice(offset, offset + limit).map((track) => track.id).filter((id) => /^\d+$/.test(String(id)))
      if (!ids.length) return response({ songs: [], privileges: [] })
      const result = await postNetease('/api/v3/song/detail', {
        c: `[${ids.map((id) => `{"id":${id}}`).join(',')}]`,
      }, cookie)
      return response(result.body)
    }

    if (route === 'search') {
      const result = await postNetease('/api/search/get', {
        s: query.keywords || '',
        type: query.type || 1,
        limit: query.limit || 30,
        offset: query.offset || 0,
      }, cookie)
      return response(result.body)
    }

    if (route === 'song/detail') {
      const ids = numericIds(query.ids || query.id)
      if (!ids.length) return response({ code: 400, message: 'ids is required' }, 400)
      const result = await postNetease('/api/v3/song/detail', {
        c: `[${ids.map((id) => `{"id":${id}}`).join(',')}]`,
      }, cookie, 'weapi')
      return response(result.body)
    }

    if (route === 'song/url/v1') {
      const ids = numericIds(query.id)
      if (!ids.length) return response({ code: 400, message: 'id is required' }, 400)
      const result = await postNetease('/api/song/enhance/player/url/v1', {
        ids: `[${ids[0]}]`,
        level: query.level || 'exhigh',
        encodeType: 'flac',
      }, cookie)
      return response(result.body)
    }

    if (route === 'lyric') {
      const result = await postNetease('/api/song/lyric', {
        id: query.id || '',
        tv: -1,
        lv: -1,
        rv: -1,
        kv: -1,
        _nmclfl: 1,
      }, cookie)
      return response(result.body)
    }

    if (route === 'personal_fm') {
      const result = await postNetease('/api/v1/radio/get', {}, cookie, 'weapi')
      return response(result.body)
    }

    if (route === 'top/playlist') {
      const result = await postNetease('/api/playlist/list', {
        cat: query.cat || '全部',
        order: query.order || 'hot',
        limit: query.limit || 50,
        offset: query.offset || 0,
        total: true,
      }, cookie, 'weapi')
      return response(result.body)
    }

    return response({ code: 404, message: 'API endpoint is not implemented in this Worker' }, 404)
  } catch (error) {
    return response({ code: 502, message: error.message || 'Netease API request failed' }, 502)
  }
}
