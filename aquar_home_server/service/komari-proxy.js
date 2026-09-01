import axios from 'axios'
import net from 'net'
import tls from 'tls'
import { URL } from 'url'
import appDao from './db/app-dao.js'

const KOMARI_RPC_PATH = '/api/rpc2'
const DEFAULT_TIMEOUT = 15000

function storedKomariConfig() {
  const config = appDao.getKomariConfig()
  return config && typeof config === 'object' ? config : {}
}

function configuredValue(key, environmentKey) {
  const storedValue = storedKomariConfig()[key]
  if (storedValue !== undefined && storedValue !== null && String(storedValue).trim()) {
    return String(storedValue).trim()
  }
  return process.env[environmentKey]
}

function configuredAuthorization() {
  const value = configuredValue('secret', 'KOMARI_AUTHORIZATION')
  if (!value) return ''
  const authorization = String(value).trim()
  // The UI accepts either a raw Komari token or a complete authorization
  // value such as “Bearer token”. Keep existing env-based values compatible.
  return /^[A-Za-z][A-Za-z0-9_-]*\s+\S+$/.test(authorization)
    ? authorization
    : `Bearer ${authorization}`
}

export class KomariProxyError extends Error {
  constructor(message, statusCode = 502) {
    super(message)
    this.name = 'KomariProxyError'
    this.statusCode = statusCode
  }
}

function configuredServer() {
  const value = configuredValue('server', 'KOMARI_SERVER') || process.env.KOMARI_URL
  if (!value || !String(value).trim()) return null

  let url
  try {
    url = new URL(String(value).trim())
  } catch (error) {
    throw new KomariProxyError('KOMARI_SERVER 不是有效的 URL', 503)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new KomariProxyError('KOMARI_SERVER 只支持 http 或 https', 503)
  }
  return url
}

function rpcTargetUrl() {
  const server = configuredServer()
  if (!server) {
    throw new KomariProxyError('尚未配置 Komari 服务地址，请设置 KOMARI_SERVER', 503)
  }

  // Accept either an origin (the documented form) or a base path, while
  // always forwarding to Komari's actual JSON-RPC endpoint.
  const basePath = server.pathname.replace(/\/+$/, '')
  server.pathname = !basePath || basePath === '/'
    ? KOMARI_RPC_PATH
    : /\/rpc2$/i.test(basePath)
      ? basePath
      : `${basePath}${KOMARI_RPC_PATH}`
  server.search = ''
  server.hash = ''
  return server
}

function upstreamHeaders() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
  const authorization = configuredAuthorization()
  if (authorization) headers.Authorization = authorization
  return headers
}

export async function proxyKomariRpc(payload) {
  let target
  try {
    target = rpcTargetUrl()
  } catch (error) {
    throw error
  }

  try {
    return await axios.post(target.toString(), payload, {
      timeout: Number(process.env.KOMARI_PROXY_TIMEOUT) || DEFAULT_TIMEOUT,
      headers: upstreamHeaders(),
      validateStatus: () => true
    })
  } catch (error) {
    const detail = error && error.code === 'ECONNABORTED'
      ? 'Komari 请求超时'
      : '无法连接到 Komari 服务'
    throw new KomariProxyError(detail, 502)
  }
}

function authTokenFromRequest(req, requestUrl) {
  const authorization = req.headers && req.headers.authorization
  if (authorization && /^Bearer\s+\S+$/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '')
  }
  return requestUrl.searchParams.get('token') || ''
}

function canUpgrade(req, requestUrl) {
  const token = authTokenFromRequest(req, requestUrl)
  // The normal Aquar dev server proxies WS directly to this process, but the
  // proxy itself must still enforce the same login boundary in every mode.
  return Boolean(token) && appDao.checkToken(token) === true
}

function sendSocketError(socket, statusCode, message) {
  if (!socket || socket.destroyed) return
  const statusText = statusCode === 401 ? 'Unauthorized' : statusCode === 503 ? 'Service Unavailable' : 'Bad Gateway'
  const body = `${message}\n`
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    '\r\n' +
    body
  )
  socket.destroy()
}

function headerValue(value) {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function openUpstream(target) {
  const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80)
  const options = {
    host: target.hostname,
    port,
    rejectUnauthorized: false
  }
  if (target.protocol === 'https:') {
    options.servername = target.hostname
    return tls.connect(options)
  }
  return net.connect(options)
}

function proxyUpgrade(req, clientSocket, head, target, requestUrl) {
  const targetUrl = new URL(target.toString())
  targetUrl.search = requestUrl.search
  targetUrl.searchParams.delete('token')

  const lines = [`${req.method || 'GET'} ${targetUrl.pathname}${targetUrl.search} HTTP/1.1`]
  const forwarded = req.headers || {}
  Object.keys(forwarded).forEach(name => {
    const lower = name.toLowerCase()
    if (lower === 'host' || lower === 'connection' || lower === 'upgrade' || lower === 'authorization') return
    lines.push(`${name}: ${headerValue(forwarded[name])}`)
  })
  lines.push(`Host: ${targetUrl.host}`)
  lines.push('Connection: Upgrade')
  lines.push('Upgrade: websocket')
  const authorization = configuredAuthorization()
  if (authorization) {
    lines.push(`Authorization: ${authorization}`)
  }

  let connected = false
  let errorSent = false
  const upstream = openUpstream(targetUrl)
  const connectEvent = targetUrl.protocol === 'https:' ? 'secureConnect' : 'connect'
  const connectTimeout = Number(process.env.KOMARI_PROXY_TIMEOUT) || DEFAULT_TIMEOUT

  const fail = (message) => {
    if (errorSent) return
    errorSent = true
    if (connected) {
      clientSocket.destroy()
    }
    else sendSocketError(clientSocket, 502, message)
  }

  upstream.setTimeout(connectTimeout, () => {
    fail('Komari WebSocket 连接超时')
    upstream.destroy()
  })
  upstream.once(connectEvent, () => {
    if (upstream.destroyed || clientSocket.destroyed) return
    connected = true
    upstream.setTimeout(0)
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head && head.length) upstream.write(head)
    clientSocket.pipe(upstream)
    upstream.pipe(clientSocket)
  })
  upstream.on('error', error => {
    fail('Komari WebSocket 连接失败')
  })
  upstream.on('close', () => {
    if (!connected) fail('Komari WebSocket 连接失败')
  })
  clientSocket.on('error', () => upstream.destroy())
  clientSocket.on('close', () => upstream.destroy())
}

export function attachKomariWebSocketProxy(server) {
  server.on('upgrade', (req, socket, head) => {
    let requestUrl
    try {
      requestUrl = new URL(req.url || '/', 'http://aquar.local')
    } catch (error) {
      return
    }

    if (requestUrl.pathname !== '/komari-api/rpc2') return
    if (!canUpgrade(req, requestUrl)) {
      sendSocketError(socket, 401, 'Aquar 登录状态已失效')
      return
    }

    let target
    try {
      target = rpcTargetUrl()
    } catch (error) {
      sendSocketError(socket, error.statusCode || 503, error.message)
      return
    }
    proxyUpgrade(req, socket, head, target, requestUrl)
  })
}
