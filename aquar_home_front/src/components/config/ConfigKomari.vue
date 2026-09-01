<template>
  <div class="config_content">
    <v-container class="lighten-5">
      <v-alert dense outlined type="info">
        配置保存在服务器的数据目录中。已保存的 Secret 不会回显；Secret 留空表示保持原值。
      </v-alert>
      <v-row align="center" dense class="py-2">
        <v-col cols="12">
          <v-text-field
            dense
            hide-details
            label="Komari 服务地址"
            placeholder="https://komari.example.com"
            v-model="configData.komari.server"
          ></v-text-field>
        </v-col>
      </v-row>
      <v-row align="center" dense class="py-2">
        <v-col cols="12">
          <v-text-field
            dense
            hide-details
            type="password"
            label="Komari Secret"
            :placeholder="secretConfigured ? '已配置，留空保持不变' : '输入 Token，或填写 Bearer Token'"
            v-model="secret"
          ></v-text-field>
        </v-col>
      </v-row>
      <v-row v-if="secretConfigured" align="center" dense class="py-1">
        <v-col cols="12">
          <v-checkbox
            dense
            hide-details
            label="清除已保存的 Secret"
            v-model="clearSecret"
          ></v-checkbox>
        </v-col>
      </v-row>
      <v-alert v-if="message" dense text type="success" class="mt-3">
        {{ message }}
      </v-alert>
      <v-alert v-if="error" dense text type="error" class="mt-3">
        {{ error }}
      </v-alert>
      <v-row justify="end" align="center" dense class="py-2">
        <v-col cols="4">
          <v-btn depressed small color="primary" :loading="saving" @click="save" style="margin:0 4px; width: 100%;">
            保存
          </v-btn>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
export default {
  name: 'ConfigKomari',
  data() {
    return {
      configData: {
        komari: { server: '' }
      },
      secret: '',
      clearSecret: false,
      secretConfigured: false,
      saving: false,
      message: '',
      error: ''
    }
  },
  created() {
    this.refreshConfig()
    this.$bus.on('refreshKomariConfig', this.refreshConfig)
  },
  beforeDestroy() {
    this.$bus.off('refreshKomariConfig', this.refreshConfig)
  },
  methods: {
    refreshConfig() {
      this.$axios.get('/api/config')
        .then(response => {
          const config = response.data && response.data.config ? response.data.config : {}
          const komari = config.komari || {}
          this.configData = Object.assign({}, config, {
            komari: { server: komari.server || '' }
          })
          this.secretConfigured = Boolean(komari.secretConfigured)
          this.secret = ''
          this.clearSecret = false
        })
        .catch(error => {
          this.error = error.response && error.response.data && error.response.data.message
            ? error.response.data.message
            : '读取 Komari 配置失败'
        })
    },
    save() {
      this.saving = true
      this.message = ''
      this.error = ''
      const payload = Object.assign({}, this.configData, {
        komari: {
          server: String(this.configData.komari.server || '').trim(),
          secret: this.secret,
          clearSecret: this.clearSecret
        }
      })
      this.$axios.post('/api/config/update', payload)
        .then(() => {
          this.message = 'Komari 配置已保存'
          this.secret = ''
          this.clearSecret = false
          this.$bus.emit('refreshKomariConfig')
          this.$bus.emit('refreshKomari')
        })
        .catch(error => {
          this.error = error.response && error.response.data && error.response.data.message
            ? error.response.data.message
            : '保存 Komari 配置失败'
        })
        .then(() => {
          this.saving = false
        })
    }
  }
}
</script>

<style lang="scss" scoped>
.config_content {
  padding: 10px;
  display: flex;
  flex-direction: column;
}
</style>
