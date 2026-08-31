<template>
  <svg class="k-trend" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
    <path v-if="area" :d="area" fill="currentColor" fill-opacity=".12" stroke="none"></path>
    <polyline
      v-if="points"
      :points="points"
      fill="none"
      vector-effect="non-scaling-stroke"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.1"
    ></polyline>
  </svg>
</template>

<script>
export default {
  name: 'KomariTrendSparkline',
  props: {
    samples: { type: Array, default: () => [] },
    max: { type: Number, default: 0 }
  },
  computed: {
    series() {
      const values = this.samples
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value >= 0)
      if (values.length < 2) return null
      const peak = this.max > 0 ? this.max : Math.max(...values)
      return values.map((value, index) => {
        const x = index * (100 / (values.length - 1))
        const y = 26 - Math.min(1, value / (peak || 1)) * 26
        return [x, y]
      })
    },
    points() {
      return this.series
        ? this.series.map(point => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ')
        : ''
    },
    area() {
      if (!this.series) return ''
      const line = this.series
        .map(point => `L${point[0].toFixed(1)} ${point[1].toFixed(1)}`)
        .join(' ')
        .replace(/^L/, 'M')
      return `${line} L100 26 L0 26 Z`
    }
  }
}
</script>

<style scoped>
.k-trend { display: block; width: 100%; height: 100%; color: inherit; }
</style>
