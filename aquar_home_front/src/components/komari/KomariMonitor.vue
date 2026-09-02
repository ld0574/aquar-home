<template>
  <section class="komari-page" aria-label="服务器监控">
    <header class="k-head">
      <div class="k-title">
        <v-icon class="k-title-icon">mdi-server-network</v-icon>
        <span>服务器监控</span>
        <span class="k-connection-dot" :class="connectionState"></span>
        <span class="k-connection-label">{{ connectionLabel }}</span>
      </div>

      <div class="k-toolbar">
        <label class="k-sort" title="排序方式">
          <v-icon x-small>mdi-sort</v-icon>
          <select v-model="sortBy" @change="setSortField(sortBy)">
            <option v-for="item in sortOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
          <button type="button" class="k-tool-button" :title="sortDirection === 'asc' ? '升序' : '降序'" @click="toggleSortDirection">
            <v-icon x-small>{{ sortDirection === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down' }}</v-icon>
          </button>
        </label>

        <div class="k-view" role="group" aria-label="视图切换">
          <button
            v-for="item in viewModes"
            :key="item.key"
            type="button"
            class="k-view-button"
            :class="{ active: viewMode === item.key }"
            :title="item.label"
            :aria-label="item.label"
            @click="setViewMode(item.key)"
          >
            <v-icon small>{{ item.icon }}</v-icon>
          </button>
        </div>

        <button type="button" class="k-refresh" :disabled="loading || pingLoading" @click="retry">
          <v-icon small :class="{ 'k-spin': loading || pingLoading }">mdi-refresh</v-icon>
          <span>{{ loading || pingLoading ? '刷新中' : '刷新' }}</span>
        </button>
      </div>
    </header>

    <div v-if="error" class="k-alert" role="alert">
      <v-icon small>mdi-alert-circle-outline</v-icon>
      <span>{{ error }}</span>
      <button type="button" @click="retry">重新连接</button>
    </div>

    <div v-if="loading && !nodes.length" class="k-state k-loading">
      <v-progress-circular indeterminate size="28" width="3" color="primary"></v-progress-circular>
      <span>正在读取 Komari 节点…</span>
    </div>

    <template v-else>
      <div v-if="nodes.length" class="k-overview">
        <SummaryCard icon="mdi-access-point-network" label="在线节点" :value="onlineCount + ' / ' + nodes.length" tone="online" note="实时状态" />
        <SummaryCard icon="mdi-arrow-down-up" label="实时带宽" :value="summaryBandwidth" tone="bandwidth" note="所有节点合计" />
        <SummaryCard icon="mdi-database" label="累计流量" :value="summaryTraffic" tone="traffic" note="上行 + 下行" />
        <SummaryCard icon="mdi-currency-cny" label="资产概览" :value="assetValue" tone="asset" :note="assetNote" />
      </div>

      <div v-if="nodes.length" class="k-content">
        <NodeListView v-if="viewMode === 'list'" :nodes="orderedNodes" :live="statusMap" :ping="pingMap" />
        <div v-else class="k-grid" :class="'view-' + viewMode">
          <template v-if="viewMode === 'large'">
            <NodeCard
              v-for="node in orderedNodes"
              :key="node._cacheKey"
              :node="node"
              :live="node._cachedStatus"
              :trend="node._cachedTrend"
              :ping="node._cachedPing"
            />
          </template>
          <template v-else-if="viewMode === 'compact'">
            <CompactNodeCard
              v-for="node in orderedNodes"
              :key="node._cacheKey"
              :node="node"
              :live="node._cachedStatus"
              :ping="node._cachedPing"
            />
          </template>
          <template v-else>
            <MiniNodeCard
              v-for="node in orderedNodes"
              :key="node._cacheKey"
              :node="node"
              :live="node._cachedStatus"
            />
          </template>
        </div>
      </div>

      <div v-else-if="!error" class="k-state k-empty">
        <v-icon large>mdi-server-off</v-icon>
        <strong>暂无服务器数据</strong>
        <span>请确认 Komari 服务已配置并允许访问。</span>
        <button type="button" @click="retry">重新连接</button>
      </div>
    </template>
  </section>
</template>

<script>
import SummaryCard from './SummaryCard.vue'
import NodeCard from './NodeCard.vue'
import CompactNodeCard from './CompactNodeCard.vue'
import MiniNodeCard from './MiniNodeCard.vue'
import NodeListView from './NodeListView.vue'
import {
  buildPingModel,
  extractPingTasks,
  extractRecords,
  formatBytes,
  formatRate,
  KomariClient,
  monthlyNodePrice,
  nodeId,
  nodeTraffic,
  normalizeNodes,
  normalizeStatusMap,
  remainingPrice
} from '../../services/komari.js'

const EMPTY_PING = () => ({ lastValue: null, loss: null, buckets: [] })

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default {
  name: 'KomariMonitor',
  components: { SummaryCard, NodeCard, CompactNodeCard, MiniNodeCard, NodeListView },
  props: {
    configData: { type: Object, default: () => ({ server: '/komari-api' }) }
  },
  data() {
    return {
      client: null,
      loading: true,
      nodes: [],
      statusMap: {},
      pingMap: {},
      trends: {},
      viewMode: this.readViewMode(),
      sortBy: 'default',
      sortDirection: 'asc',
      connectionState: 'disconnected',
      error: null,
      pingLoading: false,
      pingTimer: null,
      pageHidden: typeof document !== 'undefined' && document.hidden,
      requestGeneration: 0,
      pingGeneration: -1,
      nodeLoadingClient: null,
      nodesReady: false,
      nodeRetryTimer: null,
      nodeRetryAttempts: 0,
      visibilityHandler: null,
      pageHideHandler: null,
      pageShowHandler: null,
      alive: false,
      saveSnapshotTimer: null,
      saveSnapshotPending: false,
      sortOptions: [
        { key: 'default', label: '默认', direction: 'asc' },
        { key: 'name', label: '名称', direction: 'asc' },
        { key: 'speed', label: '实时网速', direction: 'desc' },
        { key: 'traffic', label: '累计流量', direction: 'desc' },
        { key: 'price', label: '价格', direction: 'desc' }
      ],
      viewModes: [
        { key: 'large', label: '卡片视图', icon: 'mdi-view-grid-outline' },
        { key: 'compact', label: '紧凑视图', icon: 'mdi-view-grid-compact' },
        { key: 'mini', label: '迷你视图', icon: 'mdi-view-dashboard-outline' },
        { key: 'list', label: '列表视图', icon: 'mdi-format-list-bulleted' }
      ]
    }
  },
  computed: {
    endpoint() {
      return this.configData && this.configData.server ? this.configData.server : '/komari-api'
    },
    connectionLabel() {
      const labels = { connected: '实时连接', connecting: '连接中', degraded: '更新异常', disconnected: '已断开', error: '连接失败' }
      return labels[this.connectionState] || '未连接'
    },
    onlineCount() {
      return this.nodes.filter(node => this.isOnline(node)).length
    },
    summaryBandwidth() {
      let total = 0
      this.nodes.forEach(node => {
        const status = this.statusFor(node)
        total += number(status.net_in) + number(status.net_out)
      })
      return formatRate(total)
    },
    summaryTraffic() {
      let total = 0
      this.nodes.forEach(node => {
        const status = this.statusFor(node)
        const up = status.traffic_out !== undefined ? number(status.traffic_out) : nodeTraffic(node, 'up')
        const down = status.traffic_in !== undefined ? number(status.traffic_in) : nodeTraffic(node, 'down')
        total += up + down
      })
      return formatBytes(total)
    },
    assetGroups() {
      const groups = {}
      this.nodes.forEach(node => {
        const price = number(node.price)
        if (price <= 0) return
        const currency = node.currency || '￥'
        if (!groups[currency]) groups[currency] = { currency, remaining: 0, monthly: 0 }
        groups[currency].remaining += remainingPrice(node)
        groups[currency].monthly += monthlyNodePrice(node)
      })
      return groups
    },
    assetValue() {
      const groups = Object.keys(this.assetGroups).map(key => this.assetGroups[key])
      if (!groups.length) return '—'
      if (groups.length === 1) return `${groups[0].currency}${groups[0].remaining.toFixed(2)}`
      return `${groups.length} 种币种`
    },
    assetNote() {
      const groups = Object.keys(this.assetGroups).map(key => this.assetGroups[key])
      if (!groups.length) return '未填写节点价格'
      if (groups.length === 1) return `月均 ${groups[0].currency}${groups[0].monthly.toFixed(2)}`
      return groups.map(group => `${group.currency}${group.monthly.toFixed(2)}/月`).join(' · ')
    },
    orderedNodes() {
      const direction = this.sortDirection === 'asc' ? 1 : -1

      // 预先缓存每个节点的数据，避免在渲染时重复计算
      const nodesWithCache = this.nodes.map(node => {
        const key = nodeId(node, node && node.name ? node.name : 'unknown-node')
        return {
          ...node,
          _cacheKey: key,
          _cachedStatus: this.statusMap[key] || {},
          _cachedTrend: this.trends[key] || { up: [], down: [] },
          _cachedPing: this.pingMap[key] || { lastValue: null, loss: null, buckets: [] }
        }
      })

      return nodesWithCache.slice().sort((left, right) => {
        const leftOnline = Boolean(left._cachedStatus && left._cachedStatus.online === true)
        const rightOnline = Boolean(right._cachedStatus && right._cachedStatus.online === true)
        if (leftOnline !== rightOnline) return leftOnline ? -1 : 1

        let leftValue
        let rightValue
        if (this.sortBy === 'name') {
          leftValue = this.nodeName(left).toLocaleLowerCase()
          rightValue = this.nodeName(right).toLocaleLowerCase()
          const result = leftValue.localeCompare(rightValue, 'zh-CN')
          if (result) return result * direction
        } else {
          leftValue = this.sortValue(left)
          rightValue = this.sortValue(right)
          if (leftValue !== rightValue) return (leftValue - rightValue) * direction
        }
        return number(left.weight) - number(right.weight)
      })
    }
  },
  watch: {
    configData: {
      deep: true,
      handler(value, oldValue) {
        const oldEndpoint = oldValue && oldValue.server ? oldValue.server : '/komari-api'
        const newEndpoint = value && value.server ? value.server : '/komari-api'
        if (oldEndpoint !== newEndpoint && this.alive) this.reconnectForEndpoint()
      }
    }
  },
  created() {
    this.client = new KomariClient(this.endpoint)
    this.loadSnapshot()
    this.$bus.on('refreshKomari', this.retry)
  },
  mounted() {
    this.alive = true
    this.visibilityHandler = this.handleVisibility.bind(this)
    this.pageHideHandler = this.handlePageHide.bind(this)
    this.pageShowHandler = this.handlePageShow.bind(this)
    document.addEventListener('visibilitychange', this.visibilityHandler)
    window.addEventListener('pagehide', this.pageHideHandler)
    window.addEventListener('pageshow', this.pageShowHandler)
    this.loadNodes().then(result => {
      if (result && result.loaded) this.refreshPing(result.generation, result.client)
    })
    this.startRealtime()
    this.pingTimer = setInterval(() => {
      if (!document.hidden) this.refreshPing()
    }, 60000)
  },
  beforeDestroy() {
    this.$bus.off('refreshKomari', this.retry)
    this.alive = false
    this.requestGeneration += 1
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler)
    if (this.pageHideHandler) window.removeEventListener('pagehide', this.pageHideHandler)
    if (this.pageShowHandler) window.removeEventListener('pageshow', this.pageShowHandler)
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.saveSnapshotTimer) clearTimeout(this.saveSnapshotTimer)
    this.clearNodeRetry()
    if (this.client) this.client.disconnect()
    this.saveSnapshot()
  },
  methods: {
    readViewMode() {
      const allowed = ['large', 'compact', 'mini', 'list']
      try {
        const value = localStorage.getItem('aquar_komari_view_mode')
        return allowed.indexOf(value) >= 0 ? value : 'large'
      } catch (error) {
        return 'large'
      }
    },
    setViewMode(mode) {
      if (['large', 'compact', 'mini', 'list'].indexOf(mode) < 0) return
      this.viewMode = mode
      try { localStorage.setItem('aquar_komari_view_mode', mode) } catch (error) { /* storage unavailable */ }
    },
    setSortField(field) {
      const option = this.sortOptions.find(item => item.key === field)
      if (!option) return
      this.sortBy = field
      this.sortDirection = option.direction
    },
    toggleSortDirection() {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
    },
    nodeKey(node) {
      return nodeId(node, node && node.name ? node.name : 'unknown-node')
    },
    nodeName(node) {
      return node.name || node.display_name || node.remark || node.uuid || '未知节点'
    },
    statusFor(node) {
      return this.statusMap[this.nodeKey(node)] || {}
    },
    pingFor(node) {
      return this.pingMap[this.nodeKey(node)] || EMPTY_PING()
    },
    trendFor(node) {
      return this.trends[this.nodeKey(node)] || { up: [], down: [] }
    },
    isOnline(node) {
      const status = this.statusFor(node)
      return Boolean(status && status.online === true)
    },
    sortValue(node) {
      const status = this.statusFor(node) || {}
      if (this.sortBy === 'speed') return number(status.net_in) + number(status.net_out)
      if (this.sortBy === 'traffic') {
        const up = status.traffic_out !== undefined ? number(status.traffic_out) : nodeTraffic(node, 'up')
        const down = status.traffic_in !== undefined ? number(status.traffic_in) : nodeTraffic(node, 'down')
        return up + down
      }
      if (this.sortBy === 'price') return monthlyNodePrice(node)
      return number(node.weight)
    },
    loadSnapshot() {
      try {
        const raw = localStorage.getItem(`aquar_komari_snapshot_${this.endpoint}`)
        if (!raw) return
        const snapshot = JSON.parse(raw)
        if (Array.isArray(snapshot.nodes)) this.nodes = snapshot.nodes
        if (snapshot.statusMap && typeof snapshot.statusMap === 'object') this.statusMap = snapshot.statusMap
        if (this.nodes.length) this.loading = false
      } catch (error) {
        // A corrupt monitor cache must never prevent the dashboard from loading.
      }
    },
    saveSnapshot() {
      try {
        localStorage.setItem(`aquar_komari_snapshot_${this.endpoint}`, JSON.stringify({
          nodes: this.nodes,
          statusMap: this.statusMap
        }))
      } catch (error) {
        // Private browsing or a full storage quota is safe to ignore.
      }
    },
    saveSnapshotThrottled() {
      // 节流保存：10秒内最多保存一次
      if (this.saveSnapshotPending) return
      this.saveSnapshotPending = true
      if (this.saveSnapshotTimer) clearTimeout(this.saveSnapshotTimer)
      this.saveSnapshotTimer = setTimeout(() => {
        this.saveSnapshot()
        this.saveSnapshotPending = false
        this.saveSnapshotTimer = null
      }, 10000)
    },
    clearNodeRetry() {
      if (this.nodeRetryTimer) {
        clearTimeout(this.nodeRetryTimer)
        this.nodeRetryTimer = null
      }
    },
    scheduleNodeRetry(client = this.client) {
      if (this.nodeRetryTimer || !this.alive || this.pageHidden || client !== this.client || this.nodesReady || this.connectionState !== 'connected') return
      const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.nodeRetryAttempts, 5)))
      this.nodeRetryAttempts += 1
      this.nodeRetryTimer = setTimeout(() => {
        this.nodeRetryTimer = null
        if (!this.alive || this.pageHidden || client !== this.client || this.connectionState !== 'connected') return
        this.loadNodes().then(result => {
          if (result && result.loaded) this.refreshPing(result.generation, result.client)
        })
      }, delay)
    },
    isCurrentRequest(generation, client) {
      return this.alive && generation === this.requestGeneration && client === this.client
    },
    async loadNodes() {
      const client = this.client
      if (this.nodeLoadingClient === client) return false
      const generation = ++this.requestGeneration
      this.nodeLoadingClient = client
      try {
        const result = await client.getNodes()
        if (!this.isCurrentRequest(generation, client)) return false
        this.nodes = normalizeNodes(result)
        this.loading = false
        this.error = null
        this.nodesReady = true
        this.nodeRetryAttempts = 0
        this.clearNodeRetry()
        this.saveSnapshotThrottled()
        return { loaded: true, generation, client }
      } catch (error) {
        if (!this.isCurrentRequest(generation, client)) return false
        this.loading = false
        this.nodesReady = false
        this.error = error && error.message ? error.message : 'Komari 服务连接失败'
        return { loaded: false, generation, client }
      } finally {
        if (this.nodeLoadingClient === client) this.nodeLoadingClient = null
        if (this.alive && this.client === client && !this.nodesReady && this.connectionState === 'connected') {
          this.scheduleNodeRetry(client)
        }
      }
    },
    startRealtime() {
      if (!this.client || this.pageHidden) return
      this.client.connectStatusStream(this.handleStatus.bind(this), this.handleConnectionState.bind(this))
    },
    handleStatus(result, options = {}) {
      if (!this.alive) return
      const next = normalizeStatusMap(result)
      const complete = options && options.complete === true
      if (!Object.keys(next).length && !complete) return

      // 批量更新状态，减少响应式触发
      if (complete) {
        this.statusMap = next
      } else {
        // 只更新变化的节点
        Object.keys(next).forEach(uuid => {
          this.$set(this.statusMap, uuid, next[uuid])
        })
      }

      // 批量更新趋势数据
      const trendsToUpdate = {}
      Object.keys(next).forEach(uuid => {
        const status = next[uuid]
        if (!status || status.online !== true) return
        const trend = this.trends[uuid] || { up: [], down: [] }
        trend.up.push(number(status.net_out))
        trend.down.push(number(status.net_in))
        if (trend.up.length > 60) trend.up.shift()
        if (trend.down.length > 60) trend.down.shift()
        trendsToUpdate[uuid] = trend
      })

      // 一次性更新所有趋势数据
      Object.keys(trendsToUpdate).forEach(uuid => {
        this.$set(this.trends, uuid, trendsToUpdate[uuid])
      })

      this.saveSnapshotThrottled()
    },
    handleConnectionState(state) {
      if (!this.alive) return
      this.connectionState = state
      if (state === 'connected' && !this.nodesReady && !this.nodeLoadingClient) {
        this.clearNodeRetry()
        this.loadNodes().then(result => {
          if (result && result.loaded) this.refreshPing(result.generation, result.client)
        })
      }
    },
    handleVisibility() {
      this.pageHidden = document.hidden
      if (this.pageHidden) {
        this.clearNodeRetry()
        if (this.client) this.client.disconnect()
        this.connectionState = 'disconnected'
      } else {
        this.startRealtime()
        if (this.nodes.length) this.refreshPing()
      }
    },
    handlePageShow() {
      if (!this.alive) return
      this.pageHidden = false
      this.startRealtime()
      if (this.nodes.length) this.refreshPing()
    },
    handlePageHide() {
      if (!this.alive) return
      this.saveSnapshot()
      this.pageHidden = true
      this.clearNodeRetry()
      if (this.client) this.client.disconnect()
      this.connectionState = 'disconnected'
    },
    reconnectForEndpoint() {
      this.clearNodeRetry()
      if (this.client) this.client.disconnect()
      this.client = new KomariClient(this.endpoint)
      this.nodes = []
      this.statusMap = {}
      this.pingMap = {}
      this.trends = {}
      this.nodesReady = false
      this.nodeRetryAttempts = 0
      this.error = null
      this.loading = true
      this.loadNodes().then(result => {
        if (result && result.loaded) this.refreshPing(result.generation, result.client)
      })
      this.startRealtime()
    },
    async refreshPing(generation = this.requestGeneration, client = this.client) {
      if (!this.alive || this.pageHidden || !this.nodes.length || !this.isCurrentRequest(generation, client)) return
      if (this.pingLoading && this.pingGeneration === generation) return
      this.pingLoading = true
      this.pingGeneration = generation
      const nodes = this.nodes.slice()
      try {
        const tasks = extractPingTasks(await client.getPingTasks())
        if (!this.isCurrentRequest(generation, client)) return
        const next = {}
        await Promise.all(nodes.map(async node => {
          const uuid = this.nodeKey(node)
          const relevant = tasks.filter(task => Array.isArray(task.clients) && task.clients.map(String).indexOf(String(uuid)) >= 0)
          if (!relevant.length) return
          const records = []
          await Promise.all(relevant.map(async task => {
            try {
              const result = await client.getPingRecords({ uuid, task_id: String(task.id), hours: '1' })
              records.push(...extractRecords(result))
            } catch (error) {
              // One broken task should not hide data from other tasks/nodes.
            }
          }))
          if (records.length) next[uuid] = buildPingModel(records)
        }))
        if (this.isCurrentRequest(generation, client)) this.pingMap = next
      } catch (error) {
        // Ping is optional; the node monitor remains usable when it is absent.
      } finally {
        if (this.pingGeneration === generation) this.pingLoading = false
      }
    },
    retry() {
      this.clearNodeRetry()
      this.nodeRetryAttempts = 0
      this.error = null
      this.loadNodes().then(result => {
        if (result && result.loaded) this.refreshPing(result.generation, result.client)
      })
      this.startRealtime()
    }
  }
}
</script>

<style scoped>
.komari-page {
  --k-surface: var(--tbgcolor_head, rgba(255, 255, 255, .08));
  --k-surface-2: var(--tbgcolor_sub_head2, rgba(255, 255, 255, .05));
  --k-surface-hover: var(--tbgcolor_idle, rgba(255, 255, 255, .14));
  --k-border: var(--tbcolor, rgba(255, 255, 255, .14));
  --k-border-subtle: rgba(128, 128, 128, .2);
  --k-text: var(--tcolor_main, #f2f3f5);
  --k-text-2: var(--tcolor_sub, rgba(255, 255, 255, .7));
  --k-text-3: var(--tcolor_disable, rgba(255, 255, 255, .45));
  --k-accent: var(--tcolor_primary, #5cc9f5);
  --k-cpu: var(--tcolor_primary, #5cc9f5);
  --k-memory: #a78bfa;
  --k-disk: var(--tcolor_warn, #ffb74d);
  --k-load: #f472b6;
  --k-up: var(--tcolor_primary, #5cc9f5);
  --k-down: var(--tcolor_active, #57ab5a);
  --k-online: var(--tcolor_active, #4caf50);
  --k-offline: var(--tcolor_error, #f25c5c);
  --k-warn: var(--tcolor_warn, #ffb74d);
  --k-progress-bg: rgba(128, 128, 128, .25);
  --k-price-bg: rgba(255, 183, 77, .14);
  --k-price-fg: var(--tcolor_warn, #ffc46b);
  --k-tag-bg: rgba(92, 201, 245, .14);
  --k-tag-fg: var(--tcolor_primary, #8ad4ff);
  --k-expire-ok: var(--k-text-3);
  --k-expire-urgent: var(--tcolor_warn, #ffb74d);
  --k-expire-expired: var(--tcolor_error, #ff7a7a);
  --k-lat-1: #2fc66e;
  --k-lat-2: #9fe339;
  --k-lat-3: #cbd83a;
  --k-lat-4: #e2a928;
  --k-lat-5: var(--tcolor_error, #f25c5c);
  --k-tip-bg: rgba(0, 0, 0, .84);
  --k-tip-fg: #fff;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  gap: 16px;
  padding: 20px clamp(12px, 2vw, 28px) 48px;
  color: var(--k-text);
}
.k-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.k-title { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--k-text); font-size: 20px; font-weight: 800; }
.k-title-icon { color: var(--k-accent); }
.k-connection-dot { width: 9px; height: 9px; flex-shrink: 0; border-radius: 50%; background: var(--k-offline); }.k-connection-dot.connected { background: var(--k-online); box-shadow: 0 0 6px var(--k-online); }.k-connection-dot.connecting { background: var(--k-warn); }.k-connection-dot.degraded, .k-connection-dot.error { background: var(--k-warn); }.k-connection-dot.disconnected { background: var(--k-text-3); }
.k-connection-label { color: var(--k-text-3); font-size: 10px; font-weight: 500; }
.k-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.k-sort, .k-view { display: flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--k-border); border-radius: 9px; background: var(--k-surface); color: var(--k-text-2); }
.k-sort { padding-left: 8px; }.k-sort select { max-width: 98px; padding: 4px; border: 0; outline: 0; background: transparent; color: var(--k-text); font-size: 12px; font-weight: 600; }.k-sort select option { background: var(--k-surface); color: var(--k-text); }
.k-tool-button, .k-view-button { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--k-text-3); cursor: pointer; }.k-tool-button { width: 26px; height: 26px; }.k-tool-button:hover, .k-view-button:hover { background: var(--k-surface-hover); color: var(--k-text); }.k-view-button { width: 29px; height: 27px; }.k-view-button.active { background: var(--k-surface-hover); color: var(--k-accent); }
.k-refresh { display: inline-flex; align-items: center; gap: 4px; min-height: 33px; padding: 0 10px; border: 1px solid var(--k-border); border-radius: 9px; background: var(--k-surface); color: var(--k-text-2); cursor: pointer; font-size: 12px; }.k-refresh:hover:not(:disabled) { background: var(--k-surface-hover); color: var(--k-text); }.k-refresh:disabled { cursor: wait; opacity: .65; }
.k-alert { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--k-offline); border-radius: 9px; background: rgba(200, 60, 60, .12); color: var(--k-text); font-size: 12px; }.k-alert .v-icon { color: var(--k-offline); }.k-alert span { flex: 1; min-width: 0; }.k-alert button, .k-empty button { border: 0; background: transparent; color: var(--k-accent); cursor: pointer; font-size: 12px; font-weight: 700; white-space: nowrap; }
.k-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }.k-content { width: 100%; min-width: 0; }.k-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; width: 100%; }.k-grid.view-compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }.k-grid.view-mini { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.k-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; gap: 10px; color: var(--k-text-3); text-align: center; }.k-loading { flex-direction: row; min-height: 180px; }.k-empty .v-icon { color: var(--k-text-3); }.k-empty strong { color: var(--k-text-2); font-size: 14px; }.k-empty span { font-size: 12px; }.k-empty button { margin-top: 2px; }
.k-spin { animation: k-spin 1s linear infinite; }@keyframes k-spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) { .k-grid, .k-grid.view-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }.k-grid.view-mini { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 760px) { .k-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }.k-grid, .k-grid.view-compact, .k-grid.view-mini { grid-template-columns: minmax(0, 1fr); }.k-toolbar { width: 100%; justify-content: flex-start; }.k-title { font-size: 18px; }.k-connection-label { display: none; } }
@media (max-width: 420px) { .k-overview { grid-template-columns: minmax(0, 1fr); }.k-overview > :first-child { order: -1; }.k-head { align-items: flex-start; }.k-sort select { max-width: 84px; } }
</style>
