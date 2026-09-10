<template>
  <article class="k-card k-compact" :class="{ offline: !online }">
    <header class="k-compact-head">
      <div class="k-compact-title">
        <FlagIcon :region="region" />
        <span class="k-compact-name" :title="name">{{ name }}</span>
        <span class="k-card-status" :class="online ? 'on' : 'off'"><i></i></span>
      </div>
      <OsLogo :os="os" />
    </header>
    <div class="k-compact-metrics">
      <div><span><v-icon x-small>mdi-chip</v-icon>CPU</span><strong class="cpu">{{ cpuPct.toFixed(0) }}%</strong></div>
      <div><span><v-icon x-small>mdi-memory</v-icon>内存</span><strong class="memory">{{ memoryPct.toFixed(0) }}%</strong></div>
      <div><span><v-icon x-small>mdi-harddisk</v-icon>磁盘</span><strong class="disk">{{ diskPct.toFixed(0) }}%</strong></div>
      <div><span><v-icon x-small>mdi-speedometer</v-icon>负载</span><strong class="load">{{ load.toFixed(1) }}</strong></div>
    </div>
    <div class="k-compact-health">
      <span :style="{ color: latencyColor }"><v-icon x-small>mdi-pulse</v-icon>{{ hasLatency ? Math.round(ping.lastValue) + 'ms' : '—' }}</span>
      <span :style="{ color: lossColor }"><v-icon x-small>mdi-close-circle-outline</v-icon>{{ hasLoss ? ping.loss.toFixed(1) + '%' : '—' }}</span>
      <span class="k-compact-net"><v-icon x-small>mdi-swap-vertical</v-icon>{{ formatRate(netIn + netOut) }}</span>
    </div>
    <footer class="k-compact-foot">
      <span v-if="expire" :class="expire.tone">{{ expire.label }}</span>
      <span v-if="hasPrice" class="k-foot-price" :class="{ free: price === '免费' }">{{ price }}</span>
      <span v-for="tag in tags.slice(0, 3)" :key="tag" class="k-foot-tag">{{ tag }}</span>
    </footer>
  </article>
</template>

<script>
import FlagIcon from './FlagIcon.vue'
import OsLogo from './OsLogo.vue'
import { expireMeta, formatRate, nodeTags, nodeTraffic, priceLabel } from '../../services/komari.js'

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function value(object, key) { return object && object[key] !== undefined && object[key] !== null ? number(object[key]) : null }

export default {
  name: 'KomariCompactNodeCard',
  components: { FlagIcon, OsLogo },
  props: {
    node: { type: Object, required: true },
    live: { type: Object, default: null },
    ping: { type: Object, default: () => ({ lastValue: null, loss: null }) }
  },
  computed: {
    status() { return this.live || {} },
    online() { return this.status.online === true },
    name() { return this.node.name || this.node.display_name || this.node.uuid || '未知节点' },
    region() { return this.node.region || this.node.location || '' },
    os() { return this.node.os || this.node.platform || '' },
    cpuPct() { return Math.max(0, Math.min(100, number(this.status.cpu))) },
    memoryPct() { const total = number(this.status.ram_total); return total ? Math.max(0, Math.min(100, number(this.status.ram) / total * 100)) : 0 },
    diskPct() { const total = number(this.status.disk_total); return total ? Math.max(0, Math.min(100, number(this.status.disk) / total * 100)) : 0 },
    load() { return number(this.status.load) },
    netIn() { return number(this.status.net_in) },
    netOut() { return number(this.status.net_out) },
    hasLatency() { return this.ping.lastValue !== null && this.ping.lastValue !== undefined },
    hasLoss() { return this.ping.loss !== null && this.ping.loss !== undefined },
    latencyColor() { return this.latencyColorFor(this.ping.lastValue) },
    lossColor() { return this.lossColorFor(this.ping.loss) },
    expire() { return expireMeta(this.node) },
    hasPrice() { return this.node.price !== undefined && this.node.price !== null },
    price() { return priceLabel(this.node) },
    tags() { return nodeTags(this.node) }
  },
  methods: {
    formatRate,
    latencyColorFor(value) {
      if (value === null || value === undefined) return 'var(--k-text-3)'
      if (value <= 30) return 'var(--k-lat-1)'
      if (value <= 80) return 'var(--k-lat-2)'
      if (value <= 150) return 'var(--k-lat-3)'
      if (value <= 300) return 'var(--k-lat-4)'
      return 'var(--k-lat-5)'
    },
    lossColorFor(value) {
      if (value === null || value === undefined) return 'var(--k-text-3)'
      if (value <= 1) return 'var(--k-lat-1)'
      if (value <= 3) return 'var(--k-lat-2)'
      if (value <= 8) return 'var(--k-lat-3)'
      if (value <= 20) return 'var(--k-lat-4)'
      return 'var(--k-lat-5)'
    },
    traffic(direction) {
      const key = direction === 'up' ? 'traffic_out' : 'traffic_in'
      return value(this.status, key) !== null ? value(this.status, key) : nodeTraffic(this.node, direction)
    }
  }
}
</script>

<style scoped>
.k-card { position: relative; display: flex; flex-direction: column; min-width: 0; gap: 11px; padding: 15px 16px 13px; border: 1px solid var(--k-border-subtle); border-radius: 16px; background: linear-gradient(145deg, rgba(255, 255, 255, .035), rgba(255, 255, 255, .008)), var(--k-surface); backdrop-filter: blur(18px); color: var(--k-text); box-shadow: 0 12px 30px rgba(0, 0, 0, .18), inset 0 1px 0 rgba(255, 255, 255, .025); transition: transform .2s ease, background .2s ease, box-shadow .2s ease; }
.k-card::before { content: ''; position: absolute; top: 0; left: 16px; right: 16px; height: 2px; border-radius: 0 0 4px 4px; background: linear-gradient(90deg, var(--k-accent), transparent 72%); opacity: .7; }
.k-card:hover { background: linear-gradient(145deg, rgba(255, 255, 255, .095), rgba(255, 255, 255, .03)), var(--k-surface-hover); box-shadow: 0 17px 34px rgba(0, 0, 0, .14); transform: translateY(-3px); }
.k-card.offline { opacity: .72; }
.k-compact-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.k-compact-title { display: flex; align-items: center; gap: 7px; min-width: 0; }
.k-compact-name { min-width: 0; overflow: hidden; font-size: 15px; font-weight: 800; letter-spacing: -.012em; text-overflow: ellipsis; white-space: nowrap; }
.k-card-status { display: inline-flex; align-items: center; justify-content: center; width: 9px; height: 9px; flex-shrink: 0; }
.k-card-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--k-offline); }
.k-card-status.on i { background: var(--k-online); box-shadow: 0 0 5px var(--k-online); }
.k-compact-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 10px; padding: 10px 11px; border: 1px solid var(--k-border-subtle); border-radius: 12px; background: var(--k-surface-2); }
.k-compact-metrics > div { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; }
.k-compact-metrics span { display: inline-flex; align-items: center; gap: 4px; color: var(--k-text-2); font-weight: 600; }
.k-compact-metrics .v-icon, .k-compact-health .v-icon { color: currentColor !important; }
.k-compact-metrics strong { font-variant-numeric: tabular-nums; }
.k-compact-metrics .cpu { color: var(--k-cpu); }.k-compact-metrics .memory { color: var(--k-memory); }.k-compact-metrics .disk { color: var(--k-disk); }.k-compact-metrics .load { color: var(--k-load); }
.k-compact-health { display: flex; align-items: center; gap: 10px; padding-top: 9px; border-top: 1px solid var(--k-border-subtle); color: var(--k-text-2); font-size: 12px; font-weight: 700; }
.k-compact-health > span { display: inline-flex; align-items: center; white-space: nowrap; }
.k-compact-net { margin-left: auto; color: var(--k-text-3); font-weight: 500; }
.k-compact-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; color: var(--k-text-3); font-size: 11px; }
.k-compact-foot > span { white-space: nowrap; }.k-compact-foot .ok { color: var(--k-expire-ok); }.k-compact-foot .urgent { color: var(--k-expire-urgent); }.k-compact-foot .expired { color: var(--k-expire-expired); }
.k-foot-price { padding: 3px 7px; border-radius: 7px; background: var(--k-price-bg); color: var(--k-price-fg); }.k-foot-price.free { background: var(--k-tag-bg); color: var(--k-tag-fg); }.k-foot-tag { padding: 3px 8px; border-radius: 7px; background: var(--k-tag-bg); color: var(--k-tag-fg); }
</style>
