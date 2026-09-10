<template>
  <article class="k-card" :class="{ offline: !online }">
    <header class="k-card-head">
      <div class="k-card-title-block">
        <div class="k-card-title-row">
          <FlagIcon :region="region" />
          <span class="k-card-name" :title="name">{{ name }}</span>
          <span class="k-card-status" :class="online ? 'on' : 'off'" :title="online ? '在线' : '离线'">
            <i></i>
          </span>
        </div>
        <div v-if="subtitle || ipv4 || ipv6" class="k-card-subtitle-row">
          <span v-if="subtitle" class="k-card-subtitle" :title="subtitle">{{ subtitle }}</span>
          <span v-if="ipv4" class="k-ip" title="IPv4">{{ ipv4 }}</span>
          <span v-if="ipv6" class="k-ip" title="IPv6">{{ ipv6 }}</span>
        </div>
      </div>
      <OsLogo :os="os" />
    </header>

    <div class="k-card-stack">
      <div class="k-metric-grid">
        <MetricBar icon="mdi-chip" label="CPU" :value-text="cpuPct.toFixed(0)" unit="%" :fraction="cpuPct / 100" paint="var(--k-cpu)" :detail-text="cores + ' 核'" />
        <MetricBar icon="mdi-memory" label="内存" :value-text="memoryPct.toFixed(0)" unit="%" :fraction="memoryPct / 100" paint="var(--k-memory)" :detail-text="formatBytes(memoryUsed) + ' / ' + formatBytes(memoryTotal)" />
        <MetricBar icon="mdi-harddisk" label="磁盘" :value-text="diskPct.toFixed(0)" unit="%" :fraction="diskPct / 100" paint="var(--k-disk)" :detail-text="formatBytes(diskUsed) + ' / ' + formatBytes(diskTotal)" />
        <MetricBar icon="mdi-speedometer" label="负载" :value-text="load.toFixed(2)" :fraction="loadFraction" paint="var(--k-load)" :detail-text="loadDetail" />
      </div>

      <TrafficSection
        :net-out="netOut"
        :net-in="netIn"
        :traffic-up="trafficUp"
        :traffic-down="trafficDown"
        :trend-up="trend.up"
        :trend-down="trend.down"
      />

      <TrafficQuota
        v-if="quota"
        :fraction="quota.fraction"
        :remaining-label="quota.remainingLabel"
        :detail="quota.detail"
        :type-label="quota.typeLabel"
      />

      <HealthSection :ping="ping" />
    </div>

    <footer class="k-card-foot">
      <span v-if="expire" class="k-foot-expire" :class="expire.tone"><v-icon x-small>mdi-calendar-clock</v-icon>{{ expire.label }}</span>
      <span class="k-foot-uptime"><v-icon x-small>mdi-clock-outline</v-icon>{{ uptime }}</span>
      <span v-if="hasPrice" class="k-foot-price" :class="{ free: price === '免费' }"><v-icon x-small>mdi-tag-outline</v-icon>{{ price }}</span>
      <span v-for="tag in tags" :key="tag" class="k-foot-tag">{{ tag }}</span>
    </footer>
  </article>
</template>

<script>
import FlagIcon from './FlagIcon.vue'
import OsLogo from './OsLogo.vue'
import MetricBar from './MetricBar.vue'
import TrafficSection from './TrafficSection.vue'
import TrafficQuota from './TrafficQuota.vue'
import HealthSection from './HealthSection.vue'
import {
  expireMeta,
  formatBytes,
  formatUptime,
  nodeTags,
  nodeTraffic,
  priceLabel
} from '../../services/komari.js'

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasValue(object, key) {
  return object && object[key] !== undefined && object[key] !== null
}

export default {
  name: 'KomariNodeCard',
  components: { FlagIcon, OsLogo, MetricBar, TrafficSection, TrafficQuota, HealthSection },
  props: {
    node: { type: Object, required: true },
    live: { type: Object, default: null },
    trend: { type: Object, default: () => ({ up: [], down: [] }) },
    ping: { type: Object, default: () => ({ lastValue: null, loss: null, buckets: [] }) }
  },
  computed: {
    status() { return this.live || {} },
    online() { return this.status.online === true },
    name() { return this.node.name || this.node.display_name || this.node.remark || this.node.uuid || '未知节点' },
    region() { return this.node.region || this.node.location || '' },
    subtitle() {
      return [this.node.group, this.region].filter(Boolean).join(' · ')
    },
    os() { return this.node.os || this.node.platform || '' },
    ipv4() { return this.node.ipv4 || this.node.ip || '' },
    ipv6() { return this.node.ipv6 || '' },
    cpuPct() { return Math.max(0, Math.min(100, number(this.status.cpu))) },
    cores() { return number(this.node.cpu_cores || this.node.cpuCores || 0) || 1 },
    memoryUsed() { return number(this.status.ram) },
    memoryTotal() { return number(this.status.ram_total) },
    memoryPct() { return this.memoryTotal ? Math.max(0, Math.min(100, this.memoryUsed / this.memoryTotal * 100)) : 0 },
    diskUsed() { return number(this.status.disk) },
    diskTotal() { return number(this.status.disk_total) },
    diskPct() { return this.diskTotal ? Math.max(0, Math.min(100, this.diskUsed / this.diskTotal * 100)) : 0 },
    load() { return number(this.status.load) },
    loadFraction() { return Math.max(0, Math.min(1, this.load / this.cores)) },
    loadDetail() {
      return `${this.load.toFixed(2)} / ${number(this.status.load5).toFixed(2)} / ${number(this.status.load15).toFixed(2)}`
    },
    netIn() { return number(this.status.net_in) },
    netOut() { return number(this.status.net_out) },
    trafficUp() { return hasValue(this.status, 'traffic_out') ? number(this.status.traffic_out) : nodeTraffic(this.node, 'up') },
    trafficDown() { return hasValue(this.status, 'traffic_in') ? number(this.status.traffic_in) : nodeTraffic(this.node, 'down') },
    quota() {
      const limit = number(this.node.trafficLimit !== undefined ? this.node.trafficLimit : this.node.traffic_limit)
      if (limit <= 0) return null
      const type = this.node.trafficLimitType || this.node.traffic_limit_type || 'sum'
      let used = this.trafficUp + this.trafficDown
      if (type === 'up') used = this.trafficUp
      else if (type === 'down') used = this.trafficDown
      else if (type === 'max') used = Math.max(this.trafficUp, this.trafficDown)
      else if (type === 'min') used = Math.min(this.trafficUp, this.trafficDown)
      const typeLabel = type === 'up' ? '上行' : type === 'down' ? '下行' : type === 'max' ? '取大' : type === 'min' ? '取小' : '合计'
      return {
        fraction: Math.max(0, Math.min(1, used / limit)),
        remainingLabel: formatBytes(Math.max(0, limit - used)),
        detail: `${formatBytes(used)} / ${formatBytes(limit)}`,
        typeLabel
      }
    },
    uptime() { return formatUptime(this.status.uptime) },
    expire() { return expireMeta(this.node) },
    hasPrice() { return this.node.price !== undefined && this.node.price !== null },
    price() { return priceLabel(this.node) },
    tags() { return nodeTags(this.node) }
  },
  methods: { formatBytes }
}
</script>

<style scoped>
.k-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 14px;
  padding: 18px 18px 15px;
  border: 1px solid var(--k-border-subtle);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .018)), var(--k-surface);
  backdrop-filter: blur(18px);
  color: var(--k-text);
  box-shadow: 0 14px 32px rgba(0, 0, 0, .1);
  transition: transform .22s ease, background .22s ease, box-shadow .22s ease, border-color .22s ease;
}
.k-card::before { content: ''; position: absolute; top: 0; left: 18px; right: 18px; height: 2px; border-radius: 0 0 4px 4px; background: linear-gradient(90deg, var(--k-accent), transparent 72%); opacity: .78; }
.k-card:hover { background: linear-gradient(145deg, rgba(255, 255, 255, .095), rgba(255, 255, 255, .03)), var(--k-surface-hover); border-color: rgba(89, 199, 238, .24); box-shadow: 0 18px 40px rgba(0, 0, 0, .16); transform: translateY(-3px); }
.k-card.offline { opacity: .7; }
.k-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.k-card-title-block { min-width: 0; flex: 1; }
.k-card-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.k-card-name { min-width: 0; overflow: hidden; color: var(--k-text); font-size: 16px; font-weight: 800; letter-spacing: -.018em; text-overflow: ellipsis; white-space: nowrap; }
.k-card-status { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 9px; height: 9px; border-radius: 50%; }
.k-card-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--k-offline); }
.k-card-status.on i { background: var(--k-online); box-shadow: 0 0 6px var(--k-online); }
.k-card-subtitle-row { display: flex; align-items: center; gap: 6px; min-width: 0; margin-top: 6px; }
.k-card-subtitle { overflow: hidden; color: var(--k-text-3); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.k-ip { max-width: 150px; overflow: hidden; padding: 3px 7px; border: 1px solid var(--k-border-subtle); border-radius: 7px; background: var(--k-surface-2); color: var(--k-text-3); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.k-card-stack { display: flex; flex-direction: column; min-width: 0; gap: 14px; }
.k-metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px 16px; padding: 12px 13px; border: 1px solid var(--k-border-subtle); border-radius: 14px; background: var(--k-surface-2); }
.k-card-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 9px; padding-top: 12px; border-top: 1px solid var(--k-border-subtle); color: var(--k-text-3); font-size: 11px; }
.k-card-foot > span { display: inline-flex; align-items: center; white-space: nowrap; }
.k-foot-expire.ok { color: var(--k-expire-ok); }
.k-foot-expire.urgent { color: var(--k-expire-urgent); }
.k-foot-expire.expired { color: var(--k-expire-expired); }
.k-foot-price { padding: 3px 7px; border-radius: 7px; background: var(--k-price-bg); color: var(--k-price-fg); }
.k-foot-price.free { background: var(--k-tag-bg); color: var(--k-tag-fg); }
.k-foot-tag { padding: 3px 8px; border-radius: 7px; background: var(--k-tag-bg); color: var(--k-tag-fg); }
</style>
