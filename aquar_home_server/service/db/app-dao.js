import { LowSync, JSONFileSync } from 'lowdb'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import cryptoRandomString from 'crypto-random-string'
import moment from 'moment'
import _ from 'lodash'
const DATA_ROOT = process.env.AQUAR_DATA_PATH || '/var/aquardata'
const DB_PATH = `${DATA_ROOT}/db/`
const DEFAULT_KOMARI_CONFIG = {
  server: '',
  secret: ''
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return isObject(object) && Object.prototype.hasOwnProperty.call(object, key)
}

// Add new settings to existing db.json files without replacing any user data.
function ensureConfig(data) {
  let changed = false
  if (!isObject(data.config)) {
    data.config = {}
    changed = true
  }
  if (!isObject(data.config.komari)) {
    data.config.komari = {}
    changed = true
  }
  Object.keys(DEFAULT_KOMARI_CONFIG).forEach(key => {
    if (!hasOwn(data.config.komari, key)) {
      data.config.komari[key] = DEFAULT_KOMARI_CONFIG[key]
      changed = true
    }
  })
  return changed
}

function publicConfig(config) {
  const result = _.cloneDeep(config || {})
  if (!isObject(result.komari)) result.komari = _.cloneDeep(DEFAULT_KOMARI_CONFIG)
  result.komari.secretConfigured = Boolean(config && config.komari && config.komari.secret)
  result.komari.secret = ''
  return result
}

const KOMARI_TAB = {
  title: '可用性',
  type: 'komari',
  widgets: [],
  data: { server: '/komari-api' }
}

function isKomariTab(tab) {
  return Boolean(tab && tab.type === 'komari')
}

function ensureTabs(data) {
  if (!data || !Array.isArray(data.tabs)) data.tabs = []
  if (!data.tabs.some(isKomariTab)) data.tabs.push(_.cloneDeep(KOMARI_TAB))
  return data.tabs
}

class AppDao {
  db = null
  constructor(){
    if (!fs.existsSync(DB_PATH+'db.json')){
      let defaultConfig = fs.readFileSync('./db.json','utf8')
      fs.mkdirSync(DB_PATH, { recursive: true });
      fs.writeFileSync(DB_PATH+'db.json',defaultConfig)
    }
    this.init()
  }
  init(){
    this.db = new LowSync(new JSONFileSync(DB_PATH+'db.json'))
    this.db.read()
    if (!isObject(this.db.data)) this.db.data = {}
    const configChanged = ensureConfig(this.db.data)
    this.db.chain = _.chain(this.db.data)
    if (configChanged) this.db.write()
  }

  saveAppEntry(tabIndex,entry) {
    const tab = this.db.data.tabs[tabIndex]
    if (!tab || !Array.isArray(tab.widgets)) return false
    tab.widgets.push(entry)
    this.db.write()
    return true
  }
  saveAppEntryBatch(tabIndex,widgets) {
    for(var i=0;i<widgets.length;i++){
      var w = widgets[i]
      this.db.data.tabs[tabIndex].widgets.push(w)
    }
    this.db.write()
  }
  findOne(tabIndex,id) {
    var res = this.db.chain.get('tabs['+tabIndex+'].widgets')
      .find({ 'id': id }).value()
    return res
  }
  findOneById(id) {
    let tabs = this.db.chain.get('tabs').value()
    for(let tab of tabs){
      let resList = _.filter(tab.widgets,{'id':id})
      if(!resList || resList.length === 0){
        continue
      }
      return resList[0]
    }
    return null 
  }
  findByCurIndex() {
    let index = this.db.chain.get('config.current_index').value()
    index = index ? index:0;
    const tab = this.db.data.tabs && this.db.data.tabs[index]
    return tab && Array.isArray(tab.widgets) ? tab.widgets : []
  }
  findByWidget(widget) {
    let resList = []
    let tabs = this.db.chain.get('tabs').value()
    for(let tab of tabs){
      let widgets = _.filter(tab.widgets,{'widget':widget})
      if(!widgets || widgets.length === 0){
        continue
      }
      resList.push(...widgets)
    }
    return resList 
  }
  updateWithId(tabIndex,id,item) {
    this.db.chain.get('tabs['+tabIndex+'].widgets')
    .find({ id: id })
    .assign(item).value()
    this.db.write()
  }
  updateById(id,item) {
    let tabs = this.db.chain.get('tabs').value()
    for(let i=0;i<tabs.length;i++){
      let tab = tabs[i]
      let resList = _.filter(tab.widgets,{'id':id})
      if(!resList || resList.length === 0){
        continue
      }else{
        this.db.chain.get('tabs['+i+'].widgets')
        .find({ id: id })
        .assign(item).value()
        this.db.write()
      }
    }
    
  }
  updateBatch(widgetList) {
    for(let {tabIndex, widget} of widgetList){
      this.db.chain.get('tabs['+tabIndex+'].widgets')
      .find({ id: widget.id })
      .assign(widget).value()
    }
    this.db.write()
  }
  deleteById(tabIndex,id) {
    this.db.chain.get('tabs['+tabIndex+'].widgets').remove({'id':id}).value()
    this.db.write()
  }
  updateConfig(config) {
    const incoming = isObject(config) ? _.cloneDeep(config) : {}
    const incomingKomari = isObject(incoming.komari) ? incoming.komari : null
    delete incoming.komari

    this.db.chain.get('config').assign(incoming).value()
    ensureConfig(this.db.data)

    if (incomingKomari) {
      const nextKomari = Object.assign({}, this.db.data.config.komari)
      if (hasOwn(incomingKomari, 'server')) {
        nextKomari.server = String(incomingKomari.server || '').trim()
      }
      if (incomingKomari.clearSecret === true) {
        nextKomari.secret = ''
      } else if (hasOwn(incomingKomari, 'secret')) {
        // An empty secret means “keep the existing one”, so a normal settings
        // save can never accidentally erase a stored credential.
        const secret = String(incomingKomari.secret || '').trim()
        if (secret) nextKomari.secret = secret
      }
      delete nextKomari.clearSecret
      delete nextKomari.secretConfigured
      this.db.data.config.komari = nextKomari
    }
    this.db.write()
  }
  getConfig() {
    var res = this.db.data.config
    return res
  }
  getPublicConfig() {
    return publicConfig(this.getConfig())
  }
  getKomariConfig() {
    const config = this.getConfig()
    return isObject(config.komari) ? config.komari : DEFAULT_KOMARI_CONFIG
  }
  updateAuth(authData) {
    this.db.chain.get('auth').assign(authData).value()
    this.db.write()
  }
  getAuth() {
    var res = this.db.data.auth
    return res
  }
  getSecret() {
    
    var auth = this.db.data.auth
    if(!auth || !auth.secret){
      var secret = cryptoRandomString({length: 10, type: 'alphanumeric'})
      this.db.chain.get('auth').assign({secret:secret}).value()
      this.db.write()
    }
    var secret = this.db.data.auth.secret
    return secret
  }
  checkAuth(userName, password){
    var auth = this.db.data.auth
    if(!auth || !auth.secret){
      return {code:-1, msg:"secret为空无法派发token"}
    }
    var secret = this.db.data.auth.secret
    var token = jwt.sign({ sub: userName}, secret,{ expiresIn: 60 * 60 * 24 * 180 })
    if(!auth.userName || !auth.password){
      return {code:0, msg:"系统未设置登录信息，直接进入",token: token}
    }else if(userName === auth.userName && password === auth.password){
      return {code:0, msg:"登录成功",token:token}
    }else{
      return {code:-1, msg:"用户名密码不匹配"}
    }
  }
  checkToken(token){
    var auth = this.db.data.auth
    if(!auth || !auth.secret){
      return {code:-1, msg:"token不合法"}
    }
    var secret = auth.secret
    var decodedJwt = null
    try {
      decodedJwt = jwt.verify(token, secret)
    } catch(err) {
      console.log(`${moment().format()} WARN token invalid,token:${token}`)
    }
    if(decodedJwt){
      return true
    }else {
      return false
    }
  }
  allData() {
    var res = this.db.data
    res = _.cloneDeep(res)
    delete res.auth
    res.config = publicConfig(res.config)
    // Existing installations may have been created before the monitor tab
    // existed. Expose an append-only virtual tab without rewriting their DB.
    ensureTabs(res)
    return res
  }
  getTab(index) {
    const tabs = this.db.data && this.db.data.tabs
    return Array.isArray(tabs) ? tabs[index] : undefined
  }
  updateTabs(data) {
    if (!Array.isArray(data)) return
    const existingTabs = Array.isArray(this.db.data.tabs) ? this.db.data.tabs : []
    const submittedTabs = data.filter(tab => !isKomariTab(tab))

    // The monitor tab is system-owned. A client can submit ordinary tab
    // edits, but cannot delete or rewrite the protected tab by omission.
    const protectedPlacements = []
    let ordinaryBefore = 0
    existingTabs.forEach(tab => {
      if (isKomariTab(tab)) {
        protectedPlacements.push({ tab, ordinaryBefore })
      } else {
        ordinaryBefore += 1
      }
    })

    if (!protectedPlacements.length) {
      this.db.data.tabs = _.cloneDeep(submittedTabs)
    } else {
      const nextTabs = _.cloneDeep(submittedTabs)
      protectedPlacements.forEach((placement, index) => {
        const targetIndex = Math.min(placement.ordinaryBefore + index, nextTabs.length)
        nextTabs.splice(targetIndex, 0, _.cloneDeep(placement.tab))
      })
      this.db.data.tabs = nextTabs
    }
    this.db.write()
  }
  addTab(tabData) {
    if (!Array.isArray(this.db.data.tabs)) this.db.data.tabs = []
    if (isKomariTab(tabData) && this.db.data.tabs.some(isKomariTab)) return false
    const komariIndex = this.db.data.tabs.findIndex(isKomariTab)
    if (komariIndex < 0) this.db.data.tabs.push(tabData)
    else this.db.data.tabs.splice(komariIndex, 0, tabData)
    this.db.write()
    return true
  }
  removeTab(tabIndex) {
    const tab = this.db.data.tabs && this.db.data.tabs[tabIndex]
    if (isKomariTab(tab)) return false
    this.db.chain.get('tabs').remove((value, index, array) => {
      return index === tabIndex
    }).value()
    this.db.write()
    return true
  }
  getDbInstance() {
    return this.db
  }
}

var appDao = new AppDao()
export default appDao
