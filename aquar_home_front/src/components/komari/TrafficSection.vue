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
.k-traffic-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.k-traffic-label {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  color: var(--k-text-2);
  font-size: 11px;
  font-weight: 600;
}
.k-traffic-chart { flex: 1; min-width: 36px; height: 26px; }
.k-traffic-rate { flex-shrink: 0; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.k-traffic-rate.up { color: var(--k-up); }
.k-traffic-rate.down { color: var(--k-down); }
.k-traffic-total { min-width: 48px; flex-shrink: 0; overflow: hidden; color: var(--k-text-3); font-size: 10px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
</style>
