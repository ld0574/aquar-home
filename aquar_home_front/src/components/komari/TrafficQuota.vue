<template>
  <div class="k-quota" :title="'流量阈值 · ' + typeLabel">
    <div class="k-quota-head">
      <span class="k-quota-label"><v-icon x-small>mdi-database</v-icon>剩余流量 <strong>{{ remainingLabel }}</strong></span>
      <span class="k-quota-usage">{{ detail }}</span>
    </div>
    <div class="k-quota-track">
      <span
        v-for="(color, index) in segmentColors"
        :key="index"
        class="k-quota-seg"
        :style="{ background: index < litCount ? color : 'var(--k-progress-bg)' }"
      ></span>
    </div>
  </div>
</template>

<script>
function hslToRgb(hue, saturation, lightness) {
  const s = saturation / 100
  const l = lightness / 100
  const k = n => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `rgb(${Math.round(f(0) * 255)}, ${Math.round(f(8) * 255)}, ${Math.round(f(4) * 255)})`
}

export default {
  name: 'KomariTrafficQuota',
  props: {
    fraction: { type: Number, default: 0 },
    remainingLabel: { type: String, default: '' },
    detail: { type: String, default: '' },
    typeLabel: { type: String, default: '合计' }
  },
  data() {
    const segmentCount = 18
    const segmentColors = []
    for (let i = 0; i < segmentCount; i += 1) {
      segmentColors.push(hslToRgb(150 - ((i + 0.5) / segmentCount) * 140, 70, 44))
    }
    return { segmentColors }
  },
  computed: {
    litCount() {
      return Math.round(Math.max(0, Math.min(1, Number(this.fraction) || 0)) * this.segmentColors.length)
    }
  }
}
</script>

<style scoped>
.k-quota { min-width: 0; }
.k-quota-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
.k-quota-label { display: inline-flex; align-items: center; gap: 4px; min-width: 0; color: var(--k-text-2); font-size: 11px; font-weight: 600; white-space: nowrap; }
.k-quota-label strong { margin-left: 2px; color: var(--k-text); font-size: 12px; }
.k-quota-usage { overflow: hidden; color: var(--k-text-3); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.k-quota-track { display: flex; gap: 2px; height: 8px; }
.k-quota-seg { flex: 1; min-width: 1px; border-radius: 2px; transition: background .3s ease; }
</style>
