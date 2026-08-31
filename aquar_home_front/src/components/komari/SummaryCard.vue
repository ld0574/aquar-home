<template>
  <article class="k-summary-card" :class="tone ? 'tone-' + tone : ''">
    <div class="k-summary-label">
      <v-icon small>{{ icon }}</v-icon>
      <span>{{ label }}</span>
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
  min-width: 0;
  padding: 13px 16px;
  border: 1px solid var(--k-border);
  border-radius: 12px;
  background: var(--k-surface);
  color: var(--k-text);
}

.k-summary-label {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--k-text-2);
  font-size: 11px;
  font-weight: 600;
}

.k-summary-label .v-icon {
  color: var(--k-accent);
}

.k-summary-value {
  margin-top: 5px;
  overflow: hidden;
  color: var(--k-text);
  font-size: 19px;
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

.tone-online .k-summary-label .v-icon,
.tone-online .k-summary-value { color: var(--k-online); }
.tone-bandwidth .k-summary-label .v-icon,
.tone-bandwidth .k-summary-value { color: var(--k-up); }
.tone-traffic .k-summary-label .v-icon,
.tone-traffic .k-summary-value { color: var(--k-memory); }
.tone-asset .k-summary-label .v-icon,
.tone-asset .k-summary-value { color: var(--k-warn); }
</style>
