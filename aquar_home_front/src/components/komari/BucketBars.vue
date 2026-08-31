<template>
  <div class="k-bars" @mousemove="onMove" @mouseleave="onLeave">
    <div class="k-bars-row">
      <span v-for="(bar, index) in cells" :key="index" class="k-bar-wrap">
        <span class="k-bar" :style="{ height: bar.height + '%', background: bar.color }"></span>
      </span>
    </div>
    <div v-if="tooltip.show" class="k-bars-tip" :style="{ left: tooltip.x + '%' }">
      <div>{{ tooltip.time }}</div><div class="k-bars-tip-value">{{ tooltip.text }}</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'KomariBucketBars',
  props: {
    buckets: { type: Array, default: () => [] },
    metric: { type: String, default: 'latency' },
    max: { type: Number, default: 300 }
  },
  data() {
    return { tooltip: { show: false, x: 0, time: '', text: '' } }
  },
  computed: {
    cells() {
      return this.buckets.map(bucket => {
        const value = this.metric === 'loss' ? bucket.loss : bucket.latency
        if (value === null || value === undefined || !Number.isFinite(Number(value))) {
          return { value: null, height: 3, color: 'var(--k-progress-bg)' }
        }
        const limit = this.metric === 'loss' ? 100 : this.max
        const height = Math.min(100, Math.max(4, (Number(value) / limit) * 100))
        return {
          value: Number(value),
          height,
          color: this.metric === 'loss' ? this.lossColor(Number(value)) : this.latencyColor(Number(value))
        }
      })
    }
  },
  methods: {
    latencyColor(value) {
      if (value <= 30) return 'var(--k-lat-1)'
      if (value <= 80) return 'var(--k-lat-2)'
      if (value <= 150) return 'var(--k-lat-3)'
      if (value <= 300) return 'var(--k-lat-4)'
      return 'var(--k-lat-5)'
    },
    lossColor(value) {
      if (value <= 1) return 'var(--k-lat-1)'
      if (value <= 3) return 'var(--k-lat-2)'
      if (value <= 8) return 'var(--k-lat-3)'
      if (value <= 20) return 'var(--k-lat-4)'
      return 'var(--k-lat-5)'
    },
    onMove(event) {
      if (!this.cells.length) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width) return
      const ratio = Math.max(0, Math.min(0.9999, (event.clientX - rect.left) / rect.width))
      const index = Math.min(this.cells.length - 1, Math.floor(ratio * this.cells.length))
      const cell = this.cells[index]
      if (cell.value === null) {
        this.onLeave()
        return
      }
      const bucketMs = 3600000 / this.cells.length
      const start = Date.now() - 3600000 + index * bucketMs
      const formatTime = value => {
        const date = new Date(value)
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
      this.tooltip = {
        show: true,
        x: (index + 0.5) / this.cells.length * 100,
        time: `${formatTime(start)} - ${formatTime(start + bucketMs)}`,
        text: this.metric === 'loss' ? `丢包 ${cell.value.toFixed(1)}%` : `${Math.round(cell.value)} ms`
      }
    },
    onLeave() {
      this.tooltip = { show: false, x: 0, time: '', text: '' }
    }
  }
}
</script>

<style scoped>
.k-bars { position: relative; }
.k-bars-row { display: flex; align-items: flex-end; gap: 2px; height: 34px; }
.k-bar-wrap { display: flex; align-items: flex-end; flex: 1; min-width: 1px; height: 100%; }
.k-bar { width: 100%; min-height: 2px; border-radius: 2px 2px 0 0; }
.k-bars-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  z-index: 2;
  padding: 3px 7px;
  border-radius: 5px;
  background: var(--k-tip-bg);
  color: var(--k-tip-fg);
  font-size: 10px;
  line-height: 1.5;
  pointer-events: none;
  transform: translateX(-50%);
  white-space: nowrap;
}
.k-bars-tip-value { opacity: .85; }
</style>
