import {
  KomariProxyError,
  proxyKomariRpc
} from '../service/komari-proxy.js'

function rpcError(id, message, code = -32000) {
  return {
    jsonrpc: '2.0',
    id: id === undefined ? null : id,
    error: { code, message }
  }
}

class KomariController {
  async rpc(ctx) {
    const payload = ctx.request.body && typeof ctx.request.body === 'object'
      ? ctx.request.body
      : {}

    try {
      const response = await proxyKomariRpc(payload)
      ctx.status = response.status
      if (response.headers && response.headers['content-type']) {
        ctx.set('content-type', response.headers['content-type'])
      }
      ctx.body = response.data
    } catch (error) {
      const message = error instanceof KomariProxyError
        ? error.message
        : 'Komari 服务暂时不可用'
      ctx.status = error && error.statusCode ? error.statusCode : 502
      ctx.body = rpcError(payload.id, message)
    }
  }
}

export default new KomariController()
