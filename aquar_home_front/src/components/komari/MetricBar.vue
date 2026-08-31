<template>
  <div class="k-metric">
    <div class="k-metric-head">
      <span class="k-metric-label"><v-icon x-small>{{ icon }}</v-icon>{{ label }}</span>
      <span class="k-metric-value"><strong>{{ valueText }}</strong><small v-if="unit">{{ unit }}</small></span>
    </div>
    <div v-if="detailText" class="k-metric-detail" :title="detailText">{{ detailText }}</div>
    <div class="k-metric-track" :style="{ '--k-seg-paint': paint }">
      <span
        v-for="i in segments"
        :key="i"
        class="k-metric-seg"
        :class="{ active: i <= activeSegments }"
      ></span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'KomariMetricBar',
  props: {
    icon: { type: String, default: 'mdi-chart-bar' },
    label: { type: String, default: '' },
    valueText: { type: String, default: '0' },
    unit: { type: String, default: '' },
    detailText: { type: String, default: '' },
    fraction: { type: Number, default: 0 },
    paint: { type: String, default: 'var(--k-accent)' }
  },
  data() {
    return { segments: 18 }
  },
  computed: {
    activeSegments() {
      const fraction = Math.max(0, Math.min(1, Number(this.fraction) || 0))
      return Math.round(fraction * this.segments)
    }
  }
}
</script>

<style scoped>
.k-metric { min-width: 0; }
.k-metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.k-metric-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--k-text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.k-metric-label .v-icon { color: var(--k-text-2); }
.k-metric-value {
  color: var(--k-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.k-metric-value strong { font-weight: 700; }
.k-metric-value small { margin-left: 1px; color: var(--k-text-3); font-size: 10px; }
.k-metric-detail {
  overflow: hidden;
  margin-top: 2px;
  color: var(--k-text-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.k-metric-track { display: flex; gap: 2px; height: 6px; margin-top: 4px; }
.k-metric-seg {
  flex: 1;
  min-width: 1px;
  border-radius: 2px;
  background: var(--k-progress-bg);
  transition: background .3s ease;
}
.k-metric-seg.active { background: var(--k-seg-paint); }
</style>
