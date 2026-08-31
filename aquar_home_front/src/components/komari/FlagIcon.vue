<template>
  <span v-if="flag" class="k-flag" :title="region">{{ flag }}</span>
  <span v-else-if="region" class="k-flag k-flag-fallback" :title="region">{{ regionShort }}</span>
</template>

<script>
const FLAGS = [
  [/中国|大陆|北京|上海|广州|深圳/i, '🇨🇳'],
  [/日本|东京|大阪|🇯🇵/i, '🇯🇵'],
  [/美国|洛杉矶|纽约|西雅图|🇺🇸/i, '🇺🇸'],
  [/香港|🇭🇰/i, '🇭🇰'],
  [/台湾|台北|🇹🇼/i, '🇹🇼'],
  [/新加坡|🇸🇬/i, '🇸🇬'],
  [/韩国|首尔|🇰🇷/i, '🇰🇷'],
  [/英国|伦敦|🇬🇧/i, '🇬🇧'],
  [/德国|法兰克福|🇩🇪/i, '🇩🇪'],
  [/法国|🇫🇷/i, '🇫🇷'],
  [/加拿大|🇨🇦/i, '🇨🇦'],
  [/澳大利亚|悉尼|🇦🇺/i, '🇦🇺']
]

export default {
  name: 'KomariFlagIcon',
  props: { region: { type: String, default: '' } },
  computed: {
    flag() {
      const match = FLAGS.find(item => item[0].test(this.region || ''))
      return match ? match[1] : ''
    },
    regionShort() {
      const value = String(this.region || '').split(/[·,，/]/)[0].trim()
      return value.length > 4 ? value.slice(0, 4) : value
    }
  }
}
</script>

<style scoped>
.k-flag { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 21px; line-height: 1; }
.k-flag-fallback { color: var(--k-text-3); font-size: 9px; font-weight: 700; }
</style>
