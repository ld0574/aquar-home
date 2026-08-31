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
      <span><v-icon x-small>mdi-arrow-down-up</v-icon>{{ formatRate(netIn + netOut) }}</span>
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
.k-mini { display: flex; flex-direction: column; min-width: 0; gap: 8px; padding: 10px 12px; border: 1px solid var(--k-border); border-radius: 12px; background: var(--k-surface); backdrop-filter: blur(12px); color: var(--k-text); transition: transform .2s ease, background .2s ease; }
.k-mini:hover { background: var(--k-surface-hover); transform: translateY(-2px); }.k-mini.offline { opacity: .72; }
.k-mini-head { display: flex; align-items: center; gap: 7px; min-width: 0; }.k-mini-name { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.k-mini-status { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--k-offline); }.k-mini-status.on { background: var(--k-online); box-shadow: 0 0 4px var(--k-online); }
.k-mini-stats { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; min-width: 0; color: var(--k-text-2); font-size: 10px; font-weight: 600; }.k-mini-stats span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }.k-mini-stats span:last-child { margin-left: auto; }.k-mini-stats .cpu { color: var(--k-cpu); }.k-mini-stats .memory { color: var(--k-memory); }.k-mini-stats .disk { color: var(--k-disk); }
</style>
