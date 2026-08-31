// Komari JSON-RPC client and monitor data helpers.
// All monitor network traffic goes through this module so the Vue 2 view does
// not need to know whether it is talking to a local proxy or a direct server.

const DEFAULT_BASE_URL = '/komari-api'
const STATUS_POLL_INTERVAL = 3000
let requestId = 0

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function hasOwn(object, key) {
  return object && Object.prototype.hasOwnProperty.call(object, key)
}

function firstValue(objects, keys) {
  for (let i = 0; i < objects.length; i += 1) {
    const object = objects[i]
    if (!object) continue
    for (let j = 0; j < keys.length; j += 1) {
      if (hasOwn(object, keys[j]) && object[keys[j]] !== null && object[keys[j]] !== undefined) {
        return object[keys[j]]
      }
    }
  }
  return undefined
}

function firstNumber(objects, keys) {
  const value = firstValue(objects, keys)
  return asNumber(value)
}

function optionalNumber(objects, keys) {
  const value = firstValue(objects, keys)
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_BASE_URL).trim()
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function rpcEndpoint(baseUrl) {
  const base = normalizeBaseUrl(baseUrl)
  if (/\/rpc2$/i.test(base)) return base
  if (/^https?:\/\//i.test(base)) {
    const url = new URL(base)
    const path = url.pathname.replace(/\/+$/, '')
    url.pathname = path && path !== '/' ? `${path}/api/rpc2` : '/api/rpc2'
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  return `${base}/rpc2`
}

function authToken() {
  try {
    return localStorage.getItem('token') || ''
  } catch (error) {
    return ''
  }
}

function websocketEndpoint(baseUrl) {
  const endpoint = rpcEndpoint(baseUrl)
  const currentLocation = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
  const url = new URL(endpoint, currentLocation)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  else if (url.protocol === 'http:') url.protocol = 'ws:'
  const token = authToken()
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

function parseRpcPayload(response, text) {
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch (error) {
    throw new Error(`Komari 返回了无效数据（HTTP ${response.status}）`)
  }
  if (!response.ok) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : `Komari 请求失败（HTTP ${response.status}）`
    throw new Error(message)
  }
  if (data && data.error) {
    throw new Error(data.error.message || 'Komari RPC 请求失败')
  }
  return data ? data.result : undefined
}

export class KomariClient {
  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.ws = null
    this.closed = true
    this.reconnectTimer = null
    this.statusTimer = null
    this.reconnectAttempts = 0
    this.statusInFlight = false
    this.socketRequestId = 0
    this.streamVersion = 0
    this.pending = new Map()
    this.onStatus = null
    this.onState = null
  }

  async rpc(method, params = {}, timeout = 10000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    const token = authToken()
    if (token) headers.Authorization = `Bearer ${token}`

    try {
      const response = await fetch(rpcEndpoint(this.baseUrl), {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++requestId }),
        signal: controller ? controller.signal : undefined
      })
      const text = await response.text()
      return parseRpcPayload(response, text)
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Komari 请求超时')
      }
      throw error
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  getNodes(params = {}) {
    return this.rpc('common:getNodes', params)
  }

  getLatestStatus(params = {}) {
    return this.rpc('common:getNodesLatestStatus', params)
  }

  getPingTasks() {
    return this.rpc('public:getPublicPingTasks')
  }

  getPingRecords(params = {}) {
    return this.rpc('public:getPingRecords', params)
  }

  connectStatusStream(onStatus, onState) {
    this.disconnect()
    this.closed = false
    this.streamVersion += 1
    this.onStatus = typeof onStatus === 'function' ? onStatus : null
    this.onState = typeof onState === 'function' ? onState : null
    this.reconnectAttempts = 0
    this.openSocket(this.streamVersion)
    return this
  }

  openSocket(version = this.streamVersion) {
    if (this.closed || version !== this.streamVersion) return
    if (typeof WebSocket === 'undefined') {
      this.notifyState('error', new Error('当前浏览器不支持 WebSocket'))
      return
    }

    this.notifyState('connecting')
    let socket
    try {
      socket = new WebSocket(websocketEndpoint(this.baseUrl))
    } catch (error) {
      this.notifyState('error', error)
      this.scheduleReconnect(version)
      return
    }
    this.ws = socket

    socket.onopen = () => {
      if (socket !== this.ws || this.closed || version !== this.streamVersion) return
      this.reconnectAttempts = 0
      this.notifyState('connected')
      this.startStatusPolling(version)
    }

    socket.onmessage = event => {
      if (socket !== this.ws || this.closed || version !== this.streamVersion) return
      let data
      try {
        data = JSON.parse(event.data)
      } catch (error) {
        return
      }

      const id = data && data.id !== undefined && data.id !== null ? String(data.id) : null
      if (id && this.pending.has(id)) {
        const pending = this.pending.get(id)
        this.pending.delete(id)
        clearTimeout(pending.timer)
        if (pending.version !== this.streamVersion) return
        if (data.error) pending.reject(new Error(data.error.message || 'Komari RPC 请求失败'))
        else pending.resolve(data.result)
        return
      }

      // Some Komari versions may push a status notification instead of
      // waiting for the next request/response cycle.
      if (data && data.method && data.params && this.onStatus) {
        this.onStatus(normalizeStatusMap(data.params), { complete: false })
      }
    }

    socket.onerror = error => {
      if (socket !== this.ws || this.closed || version !== this.streamVersion) return
      this.notifyState('error', error instanceof Error ? error : new Error('WebSocket 连接失败'))
    }

    socket.onclose = () => {
      if (socket !== this.ws || version !== this.streamVersion) return
      this.stopStatusPolling()
      this.rejectPending(new Error('Komari WebSocket 已断开'))
      this.ws = null
      if (!this.closed) {
        this.notifyState('disconnected')
        this.scheduleReconnect(version)
      }
    }
  }

  startStatusPolling(version = this.streamVersion) {
    this.stopStatusPolling()
    const poll = () => {
      if (this.closed || version !== this.streamVersion || !this.ws || this.ws.readyState !== WebSocket.OPEN || this.statusInFlight) return
      this.statusInFlight = true
      this.call('common:getNodesLatestStatus', {}, 8000)
        .then(result => {
          if (this.closed || version !== this.streamVersion) return
          this.notifyState('connected')
          if (this.onStatus) this.onStatus(normalizeStatusMap(result), { complete: true })
        })
        .catch(error => {
          if (!this.closed && version === this.streamVersion) this.notifyState('degraded', error)
        })
        .then(() => {
          if (version === this.streamVersion) this.statusInFlight = false
        })
    }
    poll()
    this.statusTimer = setInterval(poll, STATUS_POLL_INTERVAL)
  }

  stopStatusPolling() {
    if (this.statusTimer) {
      clearInterval(this.statusTimer)
      this.statusTimer = null
    }
    this.statusInFlight = false
  }

  call(method, params = {}, timeout = 10000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Komari WebSocket 尚未连接'))
    }
    const id = String(++this.socketRequestId)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`Komari RPC 请求超时：${method}`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer, version: this.streamVersion })
      try {
        this.ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id: Number(id) }))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  rejectPending(error) {
    this.pending.forEach(item => {
      clearTimeout(item.timer)
      item.reject(error)
    })
    this.pending.clear()
  }

  scheduleReconnect(version = this.streamVersion) {
    if (this.closed || version !== this.streamVersion || this.reconnectTimer) return
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts, 5)))
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closed && version === this.streamVersion) this.openSocket(version)
    }, delay)
  }

  notifyState(state, error) {
    if (this.onState) this.onState(state, error || null)
  }

  disconnect() {
    this.closed = true
    this.streamVersion += 1
    this.stopStatusPolling()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.rejectPending(new Error('Komari WebSocket 已关闭'))
    if (this.ws) {
      const socket = this.ws
      this.ws = null
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      try { socket.close() } catch (error) { /* already closed */ }
    }
    this.statusInFlight = false
  }
}

export function nodeId(node, fallback = '') {
  if (!node) return fallback
  const values = [node.uuid, node.node_uuid, node.id]
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === undefined || values[i] === null) continue
    const normalized = String(values[i]).trim()
    if (normalized) return normalized
  }
  return fallback
}

function unwrapResult(result, keys, depth = 0) {
  if (!isObject(result)) return result
  if (depth >= 4) return result
  for (let i = 0; i < keys.length; i += 1) {
    if (hasOwn(result, keys[i]) && (Array.isArray(result[keys[i]]) || isObject(result[keys[i]]))) {
      return unwrapResult(result[keys[i]], keys, depth + 1)
    }
  }
  if (hasOwn(result, 'data') && (Array.isArray(result.data) || isObject(result.data))) {
    return unwrapResult(result.data, keys, depth + 1)
  }
  return result
}

export function normalizeNodes(result) {
  const directNode = isObject(result) && (hasOwn(result, 'uuid') || hasOwn(result, 'node_uuid') || hasOwn(result, 'id'))
  const payload = directNode ? result : unwrapResult(result, ['nodes', 'node', 'items'])
  let list = []
  if (Array.isArray(payload)) {
    list = payload
  } else if (isObject(payload) && (hasOwn(payload, 'uuid') || hasOwn(payload, 'node_uuid') || hasOwn(payload, 'id'))) {
    list = [payload]
  } else if (isObject(payload)) {
    Object.keys(payload).forEach(key => {
      const item = payload[key]
      if (isObject(item)) list.push(Object.assign({}, item, { uuid: nodeId(item, key) }))
    })
  }
  return list
    .filter(item => isObject(item))
    .map((item, index) => Object.assign({}, item, {
      uuid: nodeId(item, item.name || item.display_name || item.remark || `node-${index + 1}`)
    }))
}

function isStatusRecord(value) {
  if (!isObject(value)) return false
  return hasOwn(value, 'online') || hasOwn(value, 'is_online') || hasOwn(value, 'cpu') ||
    hasOwn(value, 'ram') || hasOwn(value, 'memory') || hasOwn(value, 'network') ||
    hasOwn(value, 'net_in') || hasOwn(value, 'load') ||
    (hasOwn(value, 'status') && (value.status === null || typeof value.status !== 'object'))
}

export function normalizeStatus(raw) {
  if (!isObject(raw)) {
    return {
      online: false, cpu: 0, ram: 0, ram_total: 0, swap: 0, swap_total: 0,
      disk: 0, disk_total: 0, net_in: 0, net_out: 0, traffic_in: 0,
      traffic_out: 0, connections: 0, connections_udp: 0, load: 0,
      load5: 0, load15: 0, uptime: 0, process: 0, updated_at: null
    }
  }

  const cpuObject = isObject(raw.cpu) ? raw.cpu : null
  const memoryObject = isObject(raw.ram) ? raw.ram : (isObject(raw.memory) ? raw.memory : null)
  const swapObject = isObject(raw.swap) ? raw.swap : null
  const diskObject = isObject(raw.disk) ? raw.disk : null
  const networkObject = isObject(raw.network) ? raw.network : (isObject(raw.net) ? raw.net : null)
  const loadObject = isObject(raw.load) ? raw.load : null
  const connectionObject = isObject(raw.connections) ? raw.connections : null
  const onlineValue = firstValue([raw], ['online', 'is_online', 'status'])
  const statusText = String(onlineValue === undefined ? '' : onlineValue).toLowerCase()
  const online = onlineValue === undefined
    ? Object.keys(raw).length > 0
    : onlineValue === true || onlineValue === 1 || statusText === 'true' ||
      statusText === 'online' || statusText === 'up' || statusText === 'running' || statusText === 'connected'

  return {
    online,
    cpu: firstNumber([cpuObject, raw], ['usage', 'utilization', 'percent', 'cpu_usage', 'cpu_percent', 'cpu']),
    ram: firstNumber([memoryObject, raw], ['used', 'ram_used', 'memory_used', 'mem_used', 'ram']),
    ram_total: firstNumber([memoryObject, raw], ['total', 'ram_total', 'memory_total', 'mem_total']),
    swap: firstNumber([swapObject, raw], ['used', 'swap_used']),
    swap_total: firstNumber([swapObject, raw], ['total', 'swap_total']),
    // Status notifications and polling responses can be normalized more than
    // once. Keep the canonical scalar field readable alongside Komari's
    // nested `disk.used` shape.
    disk: firstNumber([diskObject, raw], ['used', 'disk', 'disk_used']),
    disk_total: firstNumber([diskObject, raw], ['total', 'disk_total']),
    net_in: firstNumber([networkObject, raw], ['down', 'download', 'in', 'rx', 'receive', 'net_in', 'download_speed']),
    net_out: firstNumber([networkObject, raw], ['up', 'upload', 'out', 'tx', 'send', 'net_out', 'upload_speed']),
    traffic_in: optionalNumber([networkObject, raw], ['totalDown', 'total_down', 'download_total', 'traffic_in', 'net_total_down']),
    traffic_out: optionalNumber([networkObject, raw], ['totalUp', 'total_up', 'upload_total', 'traffic_out', 'net_total_up']),
    connections: firstNumber([connectionObject, raw], ['tcp', 'connections', 'tcp_connections']),
    connections_udp: firstNumber([connectionObject, raw], ['udp', 'connections_udp', 'udp_connections']),
    load: firstNumber([loadObject, raw], ['load1', 'one', 'load', 'load_1']),
    load5: firstNumber([loadObject, raw], ['load5', 'five', 'load_5']),
    load15: firstNumber([loadObject, raw], ['load15', 'fifteen', 'load_15']),
    uptime: firstNumber([raw], ['uptime']),
    process: firstNumber([raw], ['process', 'processes']),
    updated_at: firstValue([raw], ['updated_at', 'updatedAt', 'time', 'created_at']) || null
  }
}

export function normalizeStatusMap(result) {
  let payload = isStatusRecord(result) ? result : unwrapResult(result, ['statuses', 'status', 'items'])
  const map = {}
  if (Array.isArray(payload)) {
    payload.forEach(item => {
      const uuid = nodeId(item)
      if (uuid) map[uuid] = normalizeStatus(item)
    })
    return map
  }
  if (isStatusRecord(payload)) {
    const uuid = nodeId(payload)
    if (uuid) map[uuid] = normalizeStatus(payload)
    return map
  }
  if (isObject(payload)) {
    Object.keys(payload).forEach(key => {
      if (isStatusRecord(payload[key])) map[String(key)] = normalizeStatus(payload[key])
    })
  }
  return map
}

function timestamp(value) {
  if (typeof value === 'number') return value < 100000000000 ? value * 1000 : value
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
    const number = Number(value)
    return number < 100000000000 ? number * 1000 : number
  }
  const parsed = new Date(value || '').getTime()
  return Number.isFinite(parsed) ? parsed : NaN
}

function recordValue(record) {
  const value = firstValue([record], ['value', 'latency', 'ping', 'ms'])
  if (value === null || value === undefined || value === '') return NaN
  const number = Number(value)
  return Number.isFinite(number) ? number : NaN
}

export function extractRecords(result) {
  if (Array.isArray(result)) return result
  if (!isObject(result)) return []
  if (Array.isArray(result.records)) return result.records
  if (isObject(result.data)) return extractRecords(result.data)
  if (Array.isArray(result.data)) return result.data
  return []
}

export function extractPingTasks(result) {
  if (Array.isArray(result)) return result
  if (!isObject(result)) return []
  if (Array.isArray(result.tasks)) return result.tasks
  if (isObject(result.data)) return extractPingTasks(result.data)
  if (Array.isArray(result.data)) return result.data
  return []
}

export function buildPingModel(records, bucketCount = 24, now = Date.now()) {
  const windowMs = 60 * 60 * 1000
  const count = Math.max(1, Math.floor(Number(bucketCount) || 24))
  const bucketMs = windowMs / count
  const start = now - windowMs
  const buckets = []
  for (let i = 0; i < count; i += 1) {
    buckets.push({ sum: 0, count: 0, lost: 0, total: 0 })
  }

  const parsed = (records || [])
    .map(record => ({ time: timestamp(record && (record.time || record.created_at || record.timestamp)), value: recordValue(record) }))
    .filter(record => Number.isFinite(record.time) && Number.isFinite(record.value))
    .sort((a, b) => a.time - b.time)

  let lastValue = null
  let total = 0
  let lost = 0
  parsed.forEach(record => {
    if (record.time < start || record.time > now) return
    total += 1
    const index = Math.max(0, Math.min(count - 1, Math.floor((record.time - start) / bucketMs)))
    const bucket = buckets[index]
    bucket.total += 1
    if (record.value >= 0) {
      lastValue = record.value
      bucket.sum += record.value
      bucket.count += 1
    } else {
      bucket.lost += 1
      lost += 1
    }
  })

  return {
    lastValue,
    loss: total ? (lost / total) * 100 : null,
    buckets: buckets.map(bucket => ({
      latency: bucket.count ? bucket.sum / bucket.count : null,
      loss: bucket.total
        ? (bucket.lost / (bucket.count + bucket.lost)) * 100
        : null
    }))
  }
}

export function formatBytes(value) {
  const bytes = Math.max(0, asNumber(value))
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`
  if (bytes < 1024 ** 5) return `${(bytes / (1024 ** 4)).toFixed(2)} TB`
  return `${(bytes / (1024 ** 5)).toFixed(2)} PB`
}

export function formatRate(value) {
  return `${formatBytes(value)}/s`
}

export function formatUptime(value) {
  const seconds = Math.max(0, asNumber(value))
  if (!seconds) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return `${days}天${hours}时`
  if (hours) return `${hours}时${minutes}分`
  return `${minutes}分`
}

export function nodeTraffic(node, direction) {
  if (!node) return 0
  const keys = direction === 'up'
    ? ['traffic_out', 'trafficUp', 'traffic_up', 'net_total_up']
    : ['traffic_in', 'trafficDown', 'traffic_down', 'net_total_down']
  return firstNumber([node], keys)
}

export function monthlyNodePrice(node) {
  const price = asNumber(node && node.price)
  const configuredDays = asNumber(node && node.billing_cycle)
  const days = configuredDays > 0 ? configuredDays : 30
  return price > 0 && days > 0 ? price / days * 30 : 0
}

export function priceLabel(node) {
  if (!node || node.price === undefined || node.price === null) return '—'
  const price = asNumber(node && node.price)
  if (price <= 0) return '免费'
  const currency = node && node.currency ? node.currency : '￥'
  const configuredCycle = asNumber(node && node.billing_cycle)
  const cycle = configuredCycle > 0 ? configuredCycle : 30
  const cycleLabel = cycle === 365 || cycle === 360 ? '/年' : cycle === 30 ? '/月' : `/${cycle}天`
  return `${currency}${price}${cycleLabel}`
}

export function remainingPrice(node, now = Date.now()) {
  const price = asNumber(node && node.price)
  if (price <= 0) return 0
  const expires = new Date(node && node.expired_at ? node.expired_at : '').getTime()
  if (!Number.isFinite(expires)) return price
  if (expires <= now) return 0
  const configuredCycle = asNumber(node && node.billing_cycle)
  const cycle = configuredCycle > 0 ? configuredCycle : 30
  return price * ((expires - now) / (cycle * 86400000))
}

export function expireMeta(node, now = Date.now()) {
  if (!node || !node.expired_at) return null
  const expires = new Date(node.expired_at).getTime()
  if (!Number.isFinite(expires)) return null
  const days = Math.ceil((expires - now) / 86400000)
  if (days > 36500) return { label: '长期有效', tone: 'ok' }
  if (days <= 0) return { label: `已过期 ${Math.abs(days)} 天`, tone: 'expired' }
  if (days <= 7) return { label: `${days} 天到期`, tone: 'urgent' }
  return { label: `${days} 天到期`, tone: 'ok' }
}

export function nodeTags(node) {
  const tags = node && node.tags
  if (Array.isArray(tags)) return tags.map(item => String(item).trim()).filter(Boolean)
  return String(tags || '').split(/[;,，；]+/).map(item => item.trim()).filter(Boolean)
}
