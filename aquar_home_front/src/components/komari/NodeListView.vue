<template>
  <div class="k-list">
    <div class="k-list-head">
      <span class="col-node">节点</span><span>系统</span><span>CPU</span><span>内存</span><span>磁盘</span><span>带宽</span><span>延迟</span><span>丢包</span><span>到期</span>
    </div>
    <div v-for="node in nodes" :key="nodeKey(node)" class="k-list-row" :class="{ offline: !isOnline(node) }">
      <span class="col-node"><FlagIcon :region="region(node)" /><span class="k-list-name" :title="name(node)">{{ name(node) }}</span><i class="k-list-status" :class="isOnline(node) ? 'on' : 'off'"></i></span>
      <span class="k-list-sub" :title="node.os || node.platform || ''">{{ node.os || node.platform || '未知' }}</span>
      <span class="cpu">{{ percent(cpu(node)) }}%</span>
      <span class="memory">{{ percent(memory(node)) }}%</span>
      <span class="disk">{{ percent(disk(node)) }}%</span>
      <span class="k-list-sub">{{ rate(node) }}</span>
      <span :style="{ color: latencyColor(node) }">{{ latency(node) }}</span>
      <span :style="{ color: lossColor(node) }">{{ loss(node) }}</span>
      <span class="k-list-sub" :class="expireClass(node)">{{ expireLabel(node) }}</span>
    </div>
    <div v-if="!nodes.length" class="k-list-empty">暂无节点</div>
  </div>
</template>

<script>
import FlagIcon from './FlagIcon.vue'
import { expireMeta, formatRate, nodeId } from '../../services/komari.js'

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

export default {
  name: 'KomariNodeListView',
  components: { FlagIcon },
  props: {
    nodes: { type: Array, default: () => [] },
    live: { type: Object, default: () => ({}) },
    ping: { type: Object, default: () => ({}) }
  },
  methods: {
    nodeKey(node) {
      return nodeId(node, node.name || node.display_name || node.remark || 'unknown-node')
    },
    status(node) { return this.live[this.nodeKey(node)] || {} },
    name(node) { return node.name || node.display_name || node.uuid || '未知节点' },
    region(node) { return node.region || node.location || '' },
    isOnline(node) { return this.status(node).online === true },
    cpu(node) { return Math.max(0, Math.min(100, number(this.status(node).cpu))) },
    memory(node) { const status = this.status(node); const total = number(status.ram_total); return total ? Math.max(0, Math.min(100, number(status.ram) / total * 100)) : 0 },
    disk(node) { const status = this.status(node); const total = number(status.disk_total); return total ? Math.max(0, Math.min(100, number(status.disk) / total * 100)) : 0 },
    percent(value) { return Math.round(value) },
    rate(node) { const status = this.status(node); return status.online === undefined ? '—' : formatRate(number(status.net_in) + number(status.net_out)) },
    latency(node) { const data = this.ping[this.nodeKey(node)]; return data && data.lastValue !== null && data.lastValue !== undefined ? `${Math.round(data.lastValue)}ms` : '—' },
    loss(node) { const data = this.ping[this.nodeKey(node)]; return data && data.loss !== null && data.loss !== undefined ? `${data.loss.toFixed(1)}%` : '—' },
    latencyColor(node) { const data = this.ping[this.nodeKey(node)]; const value = data ? data.lastValue : null; if (value === null || value === undefined) return 'var(--k-text-3)'; if (value <= 30) return 'var(--k-lat-1)'; if (value <= 80) return 'var(--k-lat-2)'; if (value <= 150) return 'var(--k-lat-3)'; if (value <= 300) return 'var(--k-lat-4)'; return 'var(--k-lat-5)' },
    lossColor(node) { const data = this.ping[this.nodeKey(node)]; const value = data ? data.loss : null; if (value === null || value === undefined) return 'var(--k-text-3)'; if (value <= 1) return 'var(--k-lat-1)'; if (value <= 3) return 'var(--k-lat-2)'; if (value <= 8) return 'var(--k-lat-3)'; if (value <= 20) return 'var(--k-lat-4)'; return 'var(--k-lat-5)' },
    expireLabel(node) { const data = expireMeta(node); return data ? data.label : '—' },
    expireClass(node) { const data = expireMeta(node); return data ? data.tone : '' }
  }
}
</script>

<style scoped>
.k-list { width: 100%; overflow-x: auto; border: 1px solid var(--k-border); border-radius: 14px; background: var(--k-surface); backdrop-filter: blur(12px); color: var(--k-text); }
.k-list-head, .k-list-row { display: grid; grid-template-columns: minmax(180px, 2.2fr) 1.2fr .7fr .7fr .7fr 1fr .8fr .8fr 1fr; align-items: center; gap: 12px; min-width: 800px; padding: 10px 16px; }
.k-list-head { border-bottom: 1px solid var(--k-border-subtle); color: var(--k-text-3); font-size: 11px; font-weight: 700; }.k-list-row { border-bottom: 1px solid var(--k-border-subtle); font-size: 12px; }.k-list-row:last-child { border-bottom: 0; }.k-list-row.offline { opacity: .62; }
.col-node { display: flex; align-items: center; gap: 8px; min-width: 0; }.k-list-name { min-width: 0; overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }.k-list-status { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--k-offline); }.k-list-status.on { background: var(--k-online); }.k-list-sub { min-width: 0; overflow: hidden; color: var(--k-text-2); text-overflow: ellipsis; white-space: nowrap; }.cpu { color: var(--k-cpu); }.memory { color: var(--k-memory); }.disk { color: var(--k-disk); }.ok { color: var(--k-expire-ok); }.urgent { color: var(--k-expire-urgent); }.expired { color: var(--k-expire-expired); }.k-list-empty { padding: 24px; color: var(--k-text-3); text-align: center; }
</style>
