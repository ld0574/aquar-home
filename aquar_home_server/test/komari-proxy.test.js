import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { after, mock, test } from 'node:test'
import jwt from 'jsonwebtoken'

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aquar-komari-test-'))
const environmentKeys = ['AQUAR_DATA_PATH', 'KOMARI_SERVER', 'KOMARI_URL', 'KOMARI_AUTHORIZATION', 'KOMARI_PROXY_TIMEOUT']
const originalEnvironment = new Map(environmentKeys.map(key => [key, process.env[key]]))
environmentKeys.forEach(key => { delete process.env[key] })
process.env.AQUAR_DATA_PATH = dataRoot
const loginSecret = 'komari-proxy-test-login-secret'
const apiKey = 'komari-proxy-test-api-key'
const certificate = {
  cert: fs.readFileSync(new URL('../cert/aquarhome.crt', import.meta.url)),
  key: fs.readFileSync(new URL('../cert/aquarhome.key', import.meta.url))
}
fs.mkdirSync(path.join(dataRoot, 'db'))
fs.writeFileSync(path.join(dataRoot, 'db', 'db.json'), JSON.stringify({
  auth: { secret: loginSecret }, config: { komari: {} }, tabs: []
}))

const { default: appDao } = await import('../service/db/app-dao.js')
const { default: chatRoomController } = await import('../endpoints/chatroom/controller/socket-controller.js')
const { default: SocketServer } = await import('../socket.js')
const { attachKomariWebSocketProxy } = await import('../service/komari-proxy.js')
// Exercise the real Socket.IO registration without starting media workers.
mock.method(chatRoomController, 'init', () => Promise.resolve())
const loginToken = jwt.sign({ sub: 'test-user' }, loginSecret, { expiresIn: '5m' })

after(() => {
  mock.restoreAll()
  originalEnvironment.forEach((value, key) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
  fs.rmSync(dataRoot, { recursive: true, force: true })
})

async function listen(t, server) {
  const sockets = new Set()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    sockets.forEach(socket => socket.destroy())
    await new Promise(resolve => server.close(resolve))
  })
  const protocol = server instanceof https.Server ? 'https' : 'http'
  return `${protocol}://127.0.0.1:${server.address().port}`
}

async function proxyServer(t, target) {
  appDao.db.data.config.komari = { server: target, secret: apiKey }
  const server = https.createServer(certificate)
  const socketServer = new SocketServer(server)
  t.after(() => socketServer.io.close())
  attachKomariWebSocketProxy(server)
  return listen(t, server)
}

function acceptUpgrade(request, socket) {
  const accept = crypto.createHash('sha1')
    .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
  socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`)
}

function upgrade(t, base, options = {}) {
  const requestPath = options.path || '/komari-api/rpc2'
  const url = new URL(requestPath, base)
  if (options.auth !== false) url.searchParams.set('token', loginToken)
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      timeout: 3000,
      rejectUnauthorized: false,
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
        Origin: 'https://aquar.example.test',
        ...options.headers
      }
    })
    request.once('response', response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.once('end', () => resolve({ status: response.statusCode, body }))
    })
    request.once('upgrade', (response, socket, head) => {
      socket.setTimeout(0)
      t.after(() => socket.destroy())
      resolve({ status: response.statusCode, socket, head })
    })
    request.once('timeout', () => request.destroy(new Error('Test handshake timed out')))
    request.once('error', reject)
    request.end()
  })
}

function readBytes(socket, length) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const cleanup = () => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('error', fail)
      socket.off('close', onClose)
    }
    const fail = error => { cleanup(); reject(error) }
    const onClose = () => fail(new Error('WebSocket closed before the frame arrived'))
    const onData = chunk => {
      chunks.push(chunk)
      size += chunk.length
      if (size >= length) {
        cleanup()
        resolve(Buffer.concat(chunks))
      }
    }
    const timer = setTimeout(() => fail(new Error('WebSocket frame timed out')), 2000)
    socket.on('data', onData)
    socket.once('error', fail)
    socket.once('close', onClose)
  })
}

test('Komari handshake survives the Socket.IO one-second cleanup interval', async t => {
  const upstream = http.createServer()
  upstream.on('upgrade', (request, socket) => {
    const timer = setTimeout(() => acceptUpgrade(request, socket), 1400)
    t.after(() => clearTimeout(timer))
  })
  const target = await listen(t, upstream)
  const proxy = await proxyServer(t, target)
  const result = await upgrade(t, proxy)
  assert.equal(result.status, 101)
})

test('TLS upstream receives its own origin and API key, and WebSocket frames pass both ways', async t => {
  const upstream = https.createServer(certificate)
  const target = (await listen(t, upstream)).replace('127.0.0.1', 'localhost')
  let forwarded
  let forwardedFrame
  const clientFrame = Buffer.from([0x81, 0x82, 1, 2, 3, 4, 0x69, 0x6b])
  const serverFrame = Buffer.from([0x81, 2, 0x6f, 0x6b])
  upstream.on('upgrade', (request, socket) => {
    forwarded = request
    if (request.headers.origin !== target) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    acceptUpgrade(request, socket)
    forwardedFrame = readBytes(socket, clientFrame.length).then(frame => {
      socket.write(serverFrame)
      return frame
    })
  })
  const proxy = await proxyServer(t, `${target}/monitor`)
  const result = await upgrade(t, proxy, {
    path: '/komari-api/rpc2?view=live', headers: { Cookie: 'aquar-session=test-cookie' }
  })
  assert.equal(result.status, 101)
  assert.equal(forwarded.url, '/monitor/api/rpc2?view=live')
  assert.equal(forwarded.headers.host, new URL(target).host)
  assert.equal(forwarded.headers.authorization, `Bearer ${apiKey}`)
  assert.equal(forwarded.headers.cookie, undefined)
  const received = readBytes(result.socket, serverFrame.length)
  result.socket.write(clientFrame)
  const [actualServerFrame, actualClientFrame] = await Promise.all([received, forwardedFrame])
  assert.deepEqual(actualServerFrame, serverFrame)
  assert.deepEqual(actualClientFrame, clientFrame)
})

test('Aquar authentication remains required before contacting Komari', async t => {
  const upstream = http.createServer()
  let contacted = false
  upstream.on('connection', () => { contacted = true })
  const proxy = await proxyServer(t, await listen(t, upstream))
  const result = await upgrade(t, proxy, { auth: false })
  assert.equal(result.status, 401)
  assert.match(result.body, /登录状态已失效/)
  assert.equal(contacted, false)
})

test('unclaimed WebSocket paths are closed explicitly', async t => {
  const proxy = await proxyServer(t, 'http://127.0.0.1:1')
  assert.equal((await upgrade(t, proxy, { path: '/unclaimed', auth: false })).status, 404)
})

test('Socket.IO still handles its own WebSocket upgrades', async t => {
  const proxy = await proxyServer(t, 'http://127.0.0.1:1')
  const result = await upgrade(t, proxy, {
    path: '/socket.io/?EIO=4&transport=websocket', auth: false
  })
  assert.equal(result.status, 101)
})

test('the Komari timeout covers waiting for the upstream handshake response', async t => {
  process.env.KOMARI_PROXY_TIMEOUT = '150'
  t.after(() => { delete process.env.KOMARI_PROXY_TIMEOUT })
  const upstream = http.createServer()
  upstream.on('upgrade', () => { /* Accept TCP but never send the HTTP upgrade response. */ })
  const proxy = await proxyServer(t, await listen(t, upstream))
  const result = await upgrade(t, proxy)
  assert.equal(result.status, 502)
  assert.match(result.body, /连接超时/)
})
