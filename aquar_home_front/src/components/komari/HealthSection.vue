<template>
  <div class="k-health">
    <div class="k-health-block">
      <div class="k-health-head">
        <span class="k-health-label"><v-icon x-small>mdi-pulse</v-icon>延迟</span>
        <span v-if="hasLatency" class="k-health-value" :style="{ color: latencyColor }">{{ Math.round(ping.lastValue) }}<small>ms</small></span>
        <span v-else class="k-health-value empty">—</span>
      </div>
      <BucketBars v-if="hasData" :buckets="ping.buckets" metric="latency" :max="300" />
      <div v-else class="k-health-empty">暂无 Ping 数据</div>
    </div>
    <div class="k-health-block">
      <div class="k-health-head">
        <span class="k-health-label"><v-icon x-small>mdi-close-circle-outline</v-icon>丢包率</span>
        <span v-if="hasLoss" class="k-health-value" :style="{ color: lossColor }">{{ ping.loss.toFixed(1) }}<small>%</small></span>
        <span v-else class="k-health-value empty">—</span>
      </div>
      <BucketBars v-if="hasData" :buckets="ping.buckets" metric="loss" :max="100" />
      <div v-else class="k-health-empty">暂无 Ping 数据</div>
    </div>
  </div>
</template>

<script>
import BucketBars from './BucketBars.vue'

export default {
  name: 'KomariHealthSection',
  components: { BucketBars },
  props: {
    ping: { type: Object, default: () => ({ lastValue: null, loss: null, buckets: [] }) }
  },
  computed: {
    hasLatency() { return this.ping.lastValue !== null && this.ping.lastValue !== undefined },
    hasLoss() { return this.ping.loss !== null && this.ping.loss !== undefined },
    hasData() {
      return Array.isArray(this.ping.buckets) && this.ping.buckets.some(item => item && (item.latency !== null || item.loss !== null))
    },
    latencyColor() { return this.latencyColorFor(this.ping.lastValue) },
    lossColor() { return this.lossColorFor(this.ping.loss) }
  },
  methods: {
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
    }
  }
}
</script>

<style scoped>
.k-health { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.k-health-block { min-width: 0; }
.k-health-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 5px; }
.k-health-label { display: inline-flex; align-items: center; gap: 4px; color: var(--k-text-2); font-size: 11px; font-weight: 600; }
.k-health-value { color: var(--k-text); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.k-health-value small { margin-left: 1px; color: var(--k-text-3); font-size: 10px; }
.k-health-value.empty { color: var(--k-text-3); }
.k-health-empty { display: flex; align-items: center; justify-content: center; height: 34px; border: 1px dashed var(--k-border-subtle); border-radius: 6px; background: var(--k-surface-2); color: var(--k-text-3); font-size: 10px; }
</style>
