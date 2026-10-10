import assert from 'node:assert/strict'
import test from 'node:test'
import worker from './index.mjs'
import { likePayload } from './ncm-api.mjs'

function assets(body = 'asset') {
  return {
    fetch: async () => new Response(body, {
      headers: { 'content-type': 'text/html' },
    }),
  }
}

test('gate denies UI and API requests without the configured key', async () => {
  const env = { GATE_KEY: 'secret', ASSETS: assets() }

  const page = await worker.fetch(new Request('https://ncm.test/'), env)
  assert.equal(page.status, 403)
  const html = await page.text()
  assert.match(html, /请输入访问口令/)
  assert.match(html, /id="gate-form"/)
  assert.match(html, /id="toggle-key"/)
  assert.match(html, /继续使用/)

  const api = await worker.fetch(new Request('https://ncm.test/api/login/status'), env)
  assert.equal(api.status, 403)
  assert.deepEqual(await api.json(), { code: 403, message: 'gate denied' })
  assert.equal(api.headers.get('access-control-allow-origin'), '*')
})

test('API CORS preflight allows temporary cross-origin browser configuration', async () => {
  const response = await worker.fetch(new Request('https://ncm.test/api/login/qr/key', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://player.example',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'x-gate-key',
    },
  }), { GATE_KEY: 'secret', ASSETS: assets() })

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('access-control-allow-headers'), /X-Gate-Key/i)
})

test('valid gate cookie reaches assets and keeps web code uncached', async () => {
  let assetRequest
  const env = {
    GATE_KEY: 'secret',
    ASSETS: {
      fetch: async (request) => {
        assetRequest = request
        return new Response('app', { headers: { 'content-type': 'text/javascript' } })
      },
    },
  }

  const response = await worker.fetch(new Request('https://ncm.test/app.js', {
    headers: { cookie: 'ncm_gate=secret' },
  }), env)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'app')
  assert.equal(new URL(assetRequest.url).pathname, '/app.js')
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('APK-style asset query maps to the requested static file', async () => {
  let assetRequest
  const response = await worker.fetch(new Request(
    'https://ncm.test/?__ncm_asset=style.css',
    { headers: { cookie: 'ncm_gate=secret' } },
  ), {
    GATE_KEY: 'secret',
    ASSETS: {
      fetch: async (request) => {
        assetRequest = new URL(request.url)
        return new Response('#app { display: flex }', {
          headers: { 'content-type': 'text/css' },
        })
      },
    },
  })

  assert.equal(response.status, 200)
  assert.equal(assetRequest.pathname, '/style.css')
  assert.equal(assetRequest.search, '')
  assert.match(await response.text(), /display: flex/)
})

test('asset query rejects traversal paths', async () => {
  const response = await worker.fetch(new Request(
    'https://ncm.test/?__ncm_asset=../server/gateway.js',
    { headers: { cookie: 'ncm_gate=secret' } },
  ), {
    GATE_KEY: 'secret',
    ASSETS: assets(),
  })

  assert.equal(response.status, 400)
})

test('QR generation is handled in the Worker without an API origin', async () => {
  const response = await worker.fetch(new Request(
    'https://ncm.test/api/login/qr/create?key=qr-key&qrimg=true',
    { headers: { cookie: 'ncm_gate=secret' } },
  ), {
    GATE_KEY: 'secret',
    ASSETS: assets(),
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.code, 200)
  assert.match(body.data.qrurl, /codekey=qr-key/)
  assert.match(body.data.qrimg, /^data:image\/svg\+xml;base64,/)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
})

test('QR polling calls NetEase directly and returns login cookies in JSON', async () => {
  const originalFetch = globalThis.fetch
  let upstreamUrl
  let upstreamHeaders
  let form
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input)
    upstreamHeaders = new Headers(init.headers)
    form = new URLSearchParams(init.body)
    return new Response(JSON.stringify({ code: 803 }), {
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'MUSIC_U=account-cookie; Path=/; HttpOnly, __csrf=csrf-token; Path=/',
      },
    })
  }

  try {
    const poll = await worker.fetch(new Request(
      'https://ncm.test/api/login/qr/check?key=qr-key&cookie=MUSIC_U%3Daccount-cookie&gate_key=secret',
      {
        headers: {
          cookie: 'ncm_gate=secret',
          'x-gate-key': 'secret',
        },
      },
    ), {
      GATE_KEY: 'secret',
      ASSETS: assets(),
    })
    assert.equal(poll.status, 200)
    assert.equal(upstreamUrl.hostname, 'interfacepc.music.163.com')
    assert.equal(upstreamUrl.pathname, '/eapi/login/qrcode/client/login')
    assert.equal(upstreamUrl.search, '')
    assert.match(form.get('params'), /^[0-9A-F]+$/)
    assert.match(upstreamHeaders.get('cookie'), /MUSIC_U=account-cookie/)
    assert.match(upstreamHeaders.get('x-real-ip'), /^116\./)
    assert.deepEqual(await poll.json(), { code: 803, cookie: 'MUSIC_U=account-cookie; __csrf=csrf-token' })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('QR key generation calls the native NetEase API from the Worker', async () => {
  const originalFetch = globalThis.fetch
  let upstreamUrl
  let form
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input)
    form = new URLSearchParams(init.body)
    return Response.json({ code: 200, unikey: 'qr-key' })
  }

  try {
    const response = await worker.fetch(new Request(
      'https://ncm.test/api/login/qr/key?gate_key=secret&_t=123',
      { headers: { 'x-gate-key': 'secret' } },
    ), {
      GATE_KEY: 'secret',
      ASSETS: assets(),
    })
    assert.equal(upstreamUrl.hostname, 'interfacepc.music.163.com')
    assert.equal(upstreamUrl.pathname, '/eapi/login/qrcode/unikey')
    assert.match(form.get('params'), /^[0-9A-F]+$/)
    assert.deepEqual(await response.json(), {
      data: { code: 200, unikey: 'qr-key' },
      code: 200,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('account status uses the Worker weapi client without an external API service', async () => {
  const originalFetch = globalThis.fetch
  let upstreamUrl
  let form
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input)
    form = new URLSearchParams(init.body)
    return Response.json({ code: 200, profile: { userId: 123, nickname: 'ncm' } })
  }

  try {
    const response = await worker.fetch(new Request(
      'https://ncm.test/api/login/status?cookie=MUSIC_U%3Daccount-cookie',
      { headers: { cookie: 'ncm_gate=secret' } },
    ), {
      GATE_KEY: 'secret',
      ASSETS: assets(),
    })
    assert.equal(upstreamUrl.hostname, 'music.163.com')
    assert.equal(upstreamUrl.pathname, '/weapi/w/nuser/account/get')
    assert.ok(form.get('params'))
    assert.match(form.get('encSecKey'), /^[0-9a-f]+$/)
    assert.deepEqual(await response.json(), {
      data: { code: 200, profile: { userId: 123, nickname: 'ncm' } },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('liked song list is available through the APK API contract', async () => {
  const originalFetch = globalThis.fetch
  let upstreamUrl
  let form
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input)
    form = new URLSearchParams(init.body)
    return Response.json({ code: 200, ids: [11, 22] })
  }

  try {
    const response = await worker.fetch(new Request(
      'https://ncm.test/api/likelist?uid=123',
      { headers: { cookie: 'ncm_gate=secret' } },
    ), {
      GATE_KEY: 'secret',
      ASSETS: assets(),
    })
    assert.equal(upstreamUrl.pathname, '/eapi/song/like/get')
    assert.match(form.get('params'), /^[0-9A-F]+$/)
    assert.deepEqual(await response.json(), { code: 200, ids: [11, 22] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('like payload supports like, unlike, and invalid IDs', () => {
  assert.deepEqual(likePayload({ id: '22', like: 'false' }), {
    alg: 'itembased',
    trackId: '22',
    like: false,
    time: '3',
  })
  assert.deepEqual(likePayload({ id: '23', like: 'true' }), {
    alg: 'itembased',
    trackId: '23',
    like: true,
    time: '3',
  })
  assert.equal(likePayload({ id: 'not-a-song' }), null)
})

test('like endpoint uses the Worker weapi client', async () => {
  const originalFetch = globalThis.fetch
  let upstreamUrl
  let form
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input)
    form = new URLSearchParams(init.body)
    return Response.json({ code: 200 })
  }

  try {
    const response = await worker.fetch(new Request(
      'https://ncm.test/api/like?id=22&like=false',
      { headers: { cookie: 'ncm_gate=secret' } },
    ), {
      GATE_KEY: 'secret',
      ASSETS: assets(),
    })
    assert.equal(upstreamUrl.pathname, '/weapi/radio/like')
    assert.ok(form.get('params'))
    assert.match(form.get('encSecKey'), /^[0-9a-f]+$/)
    assert.deepEqual(await response.json(), { code: 200 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('playlist tracks fan out to detail and song endpoints', async () => {
  const originalFetch = globalThis.fetch
  const paths = []
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    paths.push(url.pathname)
    if (url.pathname.endsWith('/playlist/detail')) {
      return Response.json({ playlist: { trackIds: [{ id: 11 }, { id: 22 }] } })
    }
    return Response.json({ songs: [{ id: 22, name: 'second' }] })
  }

  try {
    const response = await worker.fetch(new Request(
      'https://ncm.test/api/playlist/track/all?id=1&offset=1&limit=1',
      { headers: { cookie: 'ncm_gate=secret' } },
    ), {
      GATE_KEY: 'secret',
      ASSETS: assets(),
    })
    assert.deepEqual(paths, ['/eapi/v6/playlist/detail', '/eapi/v3/song/detail'])
    assert.deepEqual(await response.json(), { songs: [{ id: 22, name: 'second' }] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('unknown API routes return a clear 404 without an API origin', async () => {
  const response = await worker.fetch(
    new Request('https://ncm.test/api/not-implemented', { headers: { cookie: 'ncm_gate=secret' } }),
    { GATE_KEY: 'secret', ASSETS: assets() },
  )
  assert.equal(response.status, 404)
  assert.match((await response.json()).message, /not implemented/)
})

test('debug screenshot endpoint stays disabled', async () => {
  const response = await worker.fetch(
    new Request('https://ncm.test/debug/screenshot', { headers: { cookie: 'ncm_gate=secret' } }),
    { GATE_KEY: 'secret', ASSETS: assets() },
  )
  assert.equal(response.status, 404)
})

test('requests fail closed if the gate secret is missing', async () => {
  const response = await worker.fetch(
    new Request('https://ncm.test/'),
    { ASSETS: assets() },
  )
  assert.equal(response.status, 503)
  assert.match(await response.text(), /GATE_KEY is not configured/)
})
