<template>
  <div class="k-traffic">
    <div class="k-traffic-row">
      <span class="k-traffic-label"><v-icon x-small>mdi-arrow-up</v-icon>上行</span>
      <div class="k-traffic-chart" style="color: var(--k-up)"><TrendSparkline :samples="trendUp" /></div>
      <span class="k-traffic-rate up">{{ formatRate(netOut) }}</span>
      <span class="k-traffic-total" :title="'累计 ' + formatBytes(trafficUp)">{{ formatBytes(trafficUp) }}</span>
    </div>
    <div class="k-traffic-row">
      <span class="k-traffic-label"><v-icon x-small>mdi-arrow-down</v-icon>下行</span>
      <div class="k-traffic-chart" style="color: var(--k-down)"><TrendSparkline :samples="trendDown" /></div>
      <span class="k-traffic-rate down">{{ formatRate(netIn) }}</span>
      <span class="k-traffic-total" :title="'累计 ' + formatBytes(trafficDown)">{{ formatBytes(trafficDown) }}</span>
    </div>
  </div>
</template>

<script>
import TrendSparkline from './TrendSparkline.vue'
import { formatBytes, formatRate } from '../../services/komari.js'

export default {
  name: 'KomariTrafficSection',
  components: { TrendSparkline },
  props: {
    netOut: { type: Number, default: 0 },
    netIn: { type: Number, default: 0 },
    trafficUp: { type: Number, default: 0 },
    trafficDown: { type: Number, default: 0 },
    trendUp: { type: Array, default: () => [] },
    trendDown: { type: Array, default: () => [] }
  },
  methods: { formatBytes, formatRate }
}
</script>

<style scoped>
.k-traffic { display: flex; flex-direction: column; gap: 6px; }
.k-traffic-row { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 7px 9px; border: 1px solid var(--k-border-subtle); border-radius: 10px; background: var(--k-surface-2); transition: border-color .18s ease, background .18s ease; }
.k-traffic-row:hover { border-color: var(--k-border); background: rgba(255, 255, 255, .045); }
.k-traffic-label {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 44px;
  gap: 4px;
  color: var(--k-text-2);
  font-size: 11px;
  font-weight: 700;
}
.k-traffic-label .v-icon { font-size: 15px !important; }
.k-traffic-row:first-child .k-traffic-label .v-icon { color: var(--k-up) !important; }
.k-traffic-row:last-child .k-traffic-label .v-icon { color: var(--k-down) !important; }
.k-traffic-chart { flex: 1; min-width: 36px; height: 30px; }
.k-traffic-rate { flex-shrink: 0; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.k-traffic-rate.up { color: var(--k-up); }
.k-traffic-rate.down { color: var(--k-down); }
.k-traffic-total { min-width: 52px; flex-shrink: 0; overflow: hidden; color: var(--k-text-3); font-size: 10px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
</style>
