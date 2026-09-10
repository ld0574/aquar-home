<template>
  <article class="k-mini" :class="{ offline: !online }">
    <div class="k-mini-head">
      <FlagIcon :region="region" />
      <span class="k-mini-name" :title="name">{{ name }}</span>
      <span class="k-mini-status" :class="online ? 'on' : 'off'"></span>
    </div>
    <div class="k-mini-stats">
      <span><v-icon x-small class="cpu">mdi-chip</v-icon>{{ cpuPct.toFixed(0) }}%</span>
      <span><v-icon x-small class="memory">mdi-memory</v-icon>{{ memoryPct.toFixed(0) }}%</span>
      <span><v-icon x-small class="disk">mdi-harddisk</v-icon>{{ diskPct.toFixed(0) }}%</span>
      <span><v-icon x-small>mdi-swap-vertical</v-icon>{{ formatRate(netIn + netOut) }}</span>
    </div>
  </article>
</template>

<script>
import FlagIcon from './FlagIcon.vue'
import { formatRate } from '../../services/komari.js'

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

export default {
  name: 'KomariMiniNodeCard',
  components: { FlagIcon },
  props: { node: { type: Object, required: true }, live: { type: Object, default: null } },
  computed: {
    status() { return this.live || {} },
    online() { return this.status.online === true },
    name() { return this.node.name || this.node.display_name || this.node.uuid || '未知节点' },
    region() { return this.node.region || this.node.location || '' },
    cpuPct() { return Math.max(0, Math.min(100, number(this.status.cpu))) },
    memoryPct() { const total = number(this.status.ram_total); return total ? Math.max(0, Math.min(100, number(this.status.ram) / total * 100)) : 0 },
    diskPct() { const total = number(this.status.disk_total); return total ? Math.max(0, Math.min(100, number(this.status.disk) / total * 100)) : 0 },
    netIn() { return number(this.status.net_in) },
    netOut() { return number(this.status.net_out) }
  },
  methods: { formatRate }
}
</script>

<style scoped>
.k-mini { display: flex; flex-direction: column; min-width: 0; gap: 8px; padding: 12px 13px; border: 1px solid var(--k-border-subtle); border-radius: 13px; background: linear-gradient(145deg, rgba(255, 255, 255, .035), rgba(255, 255, 255, .008)), var(--k-surface); backdrop-filter: blur(16px); color: var(--k-text); box-shadow: 0 10px 24px rgba(0, 0, 0, .16), inset 0 1px 0 rgba(255, 255, 255, .025); transition: transform .2s ease, background .2s ease; }
.k-mini:hover { background: var(--k-surface-hover); transform: translateY(-2px); }.k-mini.offline { opacity: .72; }
.k-mini-head { display: flex; align-items: center; gap: 7px; min-width: 0; }.k-mini-name { flex: 1; min-width: 0; overflow: hidden; font-size: 14px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.k-mini-status { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--k-offline); }.k-mini-status.on { background: var(--k-online); box-shadow: 0 0 4px var(--k-online); }
.k-mini-stats { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; min-width: 0; color: var(--k-text-2); font-size: 11px; font-weight: 600; }.k-mini-stats span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }.k-mini-stats span:last-child { margin-left: auto; }.k-mini-stats .cpu { color: var(--k-cpu); }.k-mini-stats .memory { color: var(--k-memory); }.k-mini-stats .disk { color: var(--k-disk); }
.k-mini-stats .v-icon { color: var(--k-text-3) !important; }
.k-mini-stats .v-icon.cpu { color: var(--k-cpu) !important; }.k-mini-stats .v-icon.memory { color: var(--k-memory) !important; }.k-mini-stats .v-icon.disk { color: var(--k-disk) !important; }
</style>
