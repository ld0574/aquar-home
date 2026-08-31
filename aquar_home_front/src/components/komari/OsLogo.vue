<template>
  <span class="k-os" :title="os || '系统'"><v-icon small>{{ icon }}</v-icon></span>
</template>

<script>
export default {
  name: 'KomariOsLogo',
  props: { os: { type: String, default: '' } },
  computed: {
    icon() {
      const value = String(this.os || '').toLowerCase()
      if (value.indexOf('windows') >= 0) return 'mdi-microsoft-windows'
      if (value.indexOf('mac') >= 0 || value.indexOf('darwin') >= 0) return 'mdi-apple'
      if (value.indexOf('freebsd') >= 0 || value.indexOf('bsd') >= 0) return 'mdi-server'
      if (value.indexOf('android') >= 0) return 'mdi-android'
      return 'mdi-linux'
    }
  }
}
</script>

<style scoped>
.k-os { display: inline-flex; align-items: center; justify-content: center; width: 23px; height: 23px; flex-shrink: 0; border: 1px solid var(--k-border-subtle); border-radius: 6px; background: var(--k-surface-2); color: var(--k-text-2); }
</style>
