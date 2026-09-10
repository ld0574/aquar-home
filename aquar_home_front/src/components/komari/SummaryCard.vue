<template>
  <article class="k-summary-card" :class="tone ? 'tone-' + tone : ''">
    <div class="k-summary-top">
      <span class="k-summary-icon"><v-icon small>{{ icon }}</v-icon></span>
      <span class="k-summary-label">{{ label }}</span>
    </div>
    <div class="k-summary-value">{{ value }}</div>
    <div v-if="note" class="k-summary-note">{{ note }}</div>
  </article>
</template>

<script>
export default {
  name: 'KomariSummaryCard',
  props: {
    icon: { type: String, default: 'mdi-chart-box-outline' },
    label: { type: String, default: '' },
    value: { type: String, default: '—' },
    note: { type: String, default: '' },
    tone: { type: String, default: '' }
  }
}
</script>

<style scoped>
.k-summary-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 124px;
  min-width: 0;
  overflow: hidden;
  padding: 17px 18px 15px;
  border: 1px solid var(--k-border-subtle);
  border-radius: 17px;
  background: linear-gradient(145deg, rgba(255, 255, 255, .065), rgba(255, 255, 255, .025)), var(--k-surface);
  box-shadow: 0 14px 32px rgba(0, 0, 0, .08);
  color: var(--k-text);
}
.k-summary-card::after {
  content: '';
  position: absolute;
  right: -26px;
  bottom: -34px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--k-summary-accent, rgba(89, 199, 238, .12));
  filter: blur(18px);
  pointer-events: none;
}
.k-summary-top { display: flex; align-items: center; gap: 9px; }
.k-summary-icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px; background: var(--k-summary-icon-bg, rgba(89, 199, 238, .13)); color: var(--k-summary-accent, var(--k-accent)); }
.k-summary-icon .v-icon { color: inherit; }

.k-summary-label {
  color: var(--k-text-2);
  font-size: 12px;
  font-weight: 700;
}

.k-summary-value {
  margin-top: auto;
  padding-top: 11px;
  overflow: hidden;
  color: var(--k-summary-accent, var(--k-text));
  font-size: 25px;
  letter-spacing: -.035em;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.k-summary-note {
  overflow: hidden;
  margin-top: 3px;
  color: var(--k-text-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tone-online { --k-summary-accent: var(--k-online); --k-summary-icon-bg: rgba(85, 207, 136, .13); }
.tone-bandwidth { --k-summary-accent: var(--k-up); --k-summary-icon-bg: rgba(86, 203, 232, .13); }
.tone-traffic { --k-summary-accent: var(--k-memory); --k-summary-icon-bg: rgba(167, 139, 250, .13); }
.tone-asset { --k-summary-accent: var(--k-warn); --k-summary-icon-bg: rgba(246, 189, 92, .13); }
</style>
