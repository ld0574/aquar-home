import appDao from '../service/db/app-dao.js'
import { v4 as uuidv4 } from 'uuid'
import widgetAdvicer from '../service/widget-advicer.js'
import layoutUtil from '../utils/layout-util.js'
import _ from 'lodash'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseTabIndex(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function hasWidgetId(widget) {
  return isObject(widget) && widget.id !== undefined && widget.id !== null && String(widget.id).trim() !== ''
}

function isGridTab(tab) {
  return Boolean(tab && (tab.type || 'grid') === 'grid' && Array.isArray(tab.widgets))
}

function validWidgetUpdate(item, appDao) {
  const tabIndex = parseTabIndex(item && item.tabIndex)
  return isObject(item) && isObject(item.widget) && hasWidgetId(item.widget) &&
    tabIndex !== null && isGridTab(appDao.getTab(tabIndex))
}

class WidgetController {
  async list(ctx, next) {
    var index = ctx.query.index
    var resStr = await appDao.findByCurIndex()
    ctx.body = resStr
  } 
  async updateWidgets(ctx, next) {
    let widgets = ctx.request.body
    if (!Array.isArray(widgets)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'组件布局数据格式不正确'}
      return
    }
    if (widgets.some(item => !validWidgetUpdate(item, appDao))) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'只有普通控制台标签页支持组件布局'}
      return
    }
    if (widgets.some(item => {
      const tabIndex = parseTabIndex(item.tabIndex)
      return !appDao.findOne(tabIndex, item.widget.id)
    })) {
      ctx.status = 404
      ctx.body = {code:-1,msg:'未找到要更新的组件'}
      return
    }
    appDao.updateBatch(widgets)
    for(let {tabIndex, widget} of widgets){
      const normalizedTabIndex = parseTabIndex(tabIndex)
      var res = await appDao.findOne(normalizedTabIndex,widget.id)
      await widgetAdvicer.afterWidgetUpdated(normalizedTabIndex,res)
    }
    ctx.body = {code:0,msg:'批量更新成功'}
  }
  async updateById(ctx, next) {
    var data = ctx.request.body
    const tabIndex = parseTabIndex(data && data.tabIndex)
    const tab = tabIndex === null ? null : appDao.getTab(tabIndex)
    if (!isObject(data) || !isObject(data.widget) || !hasWidgetId(data.widget) || !isGridTab(tab)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'只有普通控制台标签页支持组件配置'}
      return
    }
    if (!appDao.findOne(tabIndex, data.widget.id)) {
      ctx.status = 404
      ctx.body = {code:-1,msg:'未找到要更新的组件'}
      return
    }
    // data = JSON.parse(data)
    console.log(data)
    appDao.updateWithId(tabIndex,data.widget.id,data.widget)
    var res = await appDao.findOne(tabIndex,data.widget.id)
    await widgetAdvicer.afterWidgetUpdated(tabIndex,res)
    ctx.body = res
  }
  async addWidget(ctx, next) {
    var data = ctx.request.body
    const tabIndex = parseTabIndex(data && data.tabIndex)
    const tab = tabIndex === null ? null : appDao.getTab(tabIndex)
    if (!isObject(data) || !isObject(data.widget) || !isGridTab(tab)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'只有普通控制台标签页支持添加组件'}
      return
    }
    data.widget.id = uuidv4()
    appDao.saveAppEntry(tabIndex,data.widget)
    var res = await appDao.findOne(tabIndex,data.widget.id)
    await widgetAdvicer.afterWidgetAdded(tabIndex,res)
    ctx.body = res
  }
  async addWidgetBatch(ctx, next) {
    var data = ctx.request.body || {}
    var widgets = data.widgets
    const tabIndex = parseTabIndex(data && data.tabIndex)
    const tab = tabIndex === null ? null : appDao.getTab(tabIndex)
    if (!isObject(data) || !Array.isArray(widgets) || widgets.some(widget => !isObject(widget)) || !isGridTab(tab)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'只有普通控制台标签页支持添加组件'}
      return
    }
    for(var i=0;i<widgets.length;i++){
      widgets[i].id = uuidv4()
      appDao.saveAppEntry(tabIndex,widgets[i])
      await widgetAdvicer.afterWidgetAdded(tabIndex,widgets[i])
    }
    ctx.body = {code:0,msg:'插入成功'}
  }
  async removeWidget(ctx, next) {
    var data = ctx.request.body
    const tabIndex = parseTabIndex(data && data.tabIndex)
    const tab = tabIndex === null ? null : appDao.getTab(tabIndex)
    if (!isObject(data) || data.id === undefined || data.id === null || String(data.id).trim() === '' || !isGridTab(tab)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'只有普通控制台标签页支持删除组件'}
      return
    }
    appDao.deleteById(tabIndex, data.id)
    var resStr = await appDao.findByCurIndex()
    ctx.body = resStr
  }
  async moveWidget(ctx, next) {
    const data = ctx.request.body || {}
    const isIndex = value => {
      if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0
      return typeof value === 'string' && /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value.trim()))
    }
    const fromTab = Number(data.fromTab)
    const toTab = Number(data.toTab)
    if (!isIndex(data.fromTab) || !isIndex(data.toTab)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'组件只能在普通控制台标签页之间移动'}
      return
    }
    if (!isObject(data) || data.widgetId === undefined || data.widgetId === null || String(data.widgetId).trim() === '') {
      ctx.status = 400
      ctx.body = {code:-1,msg:'组件只能在普通控制台标签页之间移动'}
      return
    }
    let sourceTab = appDao.getTab(fromTab)
    let targetTab = appDao.getTab(toTab)
    if (!sourceTab || !targetTab || fromTab === toTab || (sourceTab.type || 'grid') !== 'grid' || (targetTab.type || 'grid') !== 'grid') {
      ctx.status = 400
      ctx.body = {code:-1,msg:'组件只能在普通控制台标签页之间移动'}
      return
    }
    let sourceWidget = _.cloneDeep(appDao.findOne(fromTab, data.widgetId))
    if (!sourceWidget || !sourceWidget.layout) {
      ctx.status = 404
      ctx.body = {code:-1,msg:'未找到要移动的组件'}
      return
    }
    let layoutList = (Array.isArray(targetTab.widgets) ? targetTab.widgets : []).map(w => w.layout).filter(Boolean)
    let newLocation = layoutUtil.findLocationFitable(layoutList)
    sourceWidget.layout.x = newLocation.x
    sourceWidget.layout.y = newLocation.y
    appDao.saveAppEntry(toTab, sourceWidget)
    appDao.deleteById(fromTab, data.widgetId)
    ctx.body = {code:0,msg:'组件移动成功'}
  }
  async allData(ctx, next) {
    var resStr = await appDao.allData()
    ctx.body = resStr
  }
  async submitTabs(ctx, next) {
    var data = ctx.request.body
    if (!Array.isArray(data) || data.some(tab => {
      return !isObject(tab) || (tab.widgets !== undefined && !Array.isArray(tab.widgets)) ||
        (tab.type !== undefined && typeof tab.type !== 'string')
    })) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'标签页数据格式不正确'}
      return
    }
    appDao.updateTabs(data)
    var resStr = await appDao.allData()
    ctx.body = resStr
  }
  async addTab(ctx, next) {
    var data = {title:"新标签",widgets:[]}
    appDao.addTab(data)
    var resStr = await appDao.allData()
    ctx.body = resStr
  }
  async removeTab(ctx, next) {
    var data = ctx.request.body
    const tabIndex = parseTabIndex(data && data.tabIndex)
    if (tabIndex === null || !appDao.getTab(tabIndex)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'标签页不存在'}
      return
    }
    if (!appDao.removeTab(tabIndex)) {
      ctx.status = 400
      ctx.body = {code:-1,msg:'系统标签页不可删除'}
      return
    }
    var resStr = await appDao.allData()
    ctx.body = resStr
  }
  
}
var widgetController = new WidgetController()
export default widgetController
