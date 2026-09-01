# Aquar Home 集成 Komari-Home-Plus 监控页实施方案

## 1. 目标

在现有 `Aquar Home` 中新增一个“可用性”Tab，用于展示 `Komari-Home-Plus` 的服务器监控界面。

最终效果：

```text
Aquar Home

控制台 | 可用性
        └── Komari Monitor
            ├── 在线节点
            ├── 实时带宽
            ├── 累计流量
            ├── 资产概览
            ├── 节点卡片
            ├── CPU / 内存 / 磁盘 / 负载
            ├── 上下行带宽
            ├── Ping / 丢包
            ├── 流量趋势
            └── 排序 / 视图切换
```

本次改造原则：

> 不升级 Aquar 到 Vue 3。
> 不把整个 Komari-Home-Plus 降级到 Vue 2。
> 只参考 Komari-Home-Plus 的 Monitor 页面和 RPC 逻辑，在 Aquar Vue 2 中原生重写监控模块。

---

## 2. 项目来源

### Aquar Home

Repository:

```text
https://github.com/ld0574/aquar-home
```

现有技术栈重点：

```text
Vue 2
Vue Router 3
Vuetify 2
vue-grid-layout
```

主要职责：

```text
家庭服务入口
Docker 状态
Proxmox VE
TrueNAS
快捷应用入口
Dashboard Widget
```

---

### Komari-Home-Plus

Repository:

```text
https://github.com/123nhh/Komari-Home-Plus
```

主要技术栈：

```text
Vue 3
Vue Router 4
Vite
```

本次只使用它作为以下内容的参考实现：

```text
Monitor 页面布局
Node Card
Metric Bar
Traffic Section
Health Section
Sparkline
Ping / 丢包显示
节点在线状态
排序
视图切换
Komari JSON-RPC
Komari WebSocket
```

---

# 3. 核心技术决策

## 3.1 不升级 Aquar 到 Vue 3

本次不要做：

```text
Vue 2 -> Vue 3
Vue Router 3 -> Vue Router 4
Vuetify 2 -> Vuetify 3
Webpack -> Vite
vue-grid-layout 替换
整个 Dashboard 重构
```

原因：

```text
改动范围过大
容易破坏现有 Dashboard
Vuetify 2 -> 3 迁移成本高
第三方组件兼容风险高
这次只是新增一个监控页面，不值得扩大范围
```

---

## 3.2 不直接引用 Komari Vue 3 组件

禁止：

```js
import KomariMonitor from "../../../Komari-Home-Plus/src/..."
```

Aquar Vue 2 无法直接使用 Vue 3 SFC。

正确方案：

```text
阅读 Komari Monitor 实现
        ↓
提取业务逻辑
        ↓
提取 CSS
        ↓
把组件改写成 Vue 2 Options API
        ↓
放入 Aquar
```

---

## 3.3 不使用 iframe

禁止：

```html
<iframe src="https://komari.example.com"></iframe>
```

原因：

```text
UI 不统一
双重导航
主题无法统一
高度和滚动麻烦
移动端体验差
后续难扩展
```

必须在 Aquar 内原生渲染。

---


# 3.4 原有 Aquar 数据必须完整保留

这是本次改造的最高优先级约束之一。

Aquar 现有数据中包含大量已经维护好的：

```text
网址配置
应用入口
图标数据
Widget 配置
Tab 配置
布局位置
服务地址
自定义名称
快捷入口
现有监控配置
```

这些数据都属于已有生产数据，**不得删除、覆盖、重置、迁移失败或改变数据结构含义**。

Codex 必须遵守：

```text
1. 不删除任何现有数据文件
2. 不清空任何现有配置
3. 不重建默认配置覆盖用户数据
4. 不修改已有网址字段的含义
5. 不修改已有图标字段的含义
6. 不修改已有 Widget ID
7. 不修改已有 Tab ID
8. 不改变已有 Widget 布局坐标
9. 不执行 destructive migration
10. 不因为 schema 变化要求用户重新配置
```

如果必须扩展配置结构，只允许：

```text
向后兼容地新增字段
```

例如旧数据：

```json
{
  "title": "控制台",
  "widgets": [...]
}
```

必须继续可以正常运行。

代码应当将没有 `type` 的旧 Tab 自动视为：

```text
type = "grid"
```

例如：

```js
const tabType = tab.type || 'grid'
```

而不是要求把所有旧数据修改为：

```json
{
  "title": "控制台",
  "type": "grid",
  "widgets": [...]
}
```

新的 Komari Tab 可以使用新增字段：

```json
{
  "title": "可用性",
  "type": "komari",
  "widgets": [],
  "data": {
    "server": "/komari-api"
  }
}
```

但原有 Tab 和 Widget 数据必须零迁移即可继续使用。

在修改任何：

```text
config
database
JSON
localStorage
backend model
schema
migration
```

之前，Codex 必须先检查现有数据保存机制。

如果发现需要 schema migration：

```text
先停止实现
先报告原因、影响范围和兼容方案
不要直接执行
```

原则：

> Existing Aquar user data is immutable unless an explicit backward-compatible extension is required.

尤其注意：

> 现有网址数据和图标数据绝对不能因为这次集成被重置、重建或丢失。


# 4. 最终页面结构

Aquar 当前：

```text
控制台
```

目标：

```text
控制台 | 可用性
```

其中：

## 控制台

保持现状。

```text
vue-grid-layout
├── Docker
├── PVE
├── TrueNAS
├── Grafana
├── Prometheus
├── Home Assistant
└── ...
```

禁止重构。

---

## 可用性

不进入 `vue-grid-layout`。

直接渲染：

```text
KomariMonitor.vue
```

页面结构：

```text
服务器监控 ●

[在线节点] [实时带宽] [累计流量] [资产概览]

[排序] [视图切换]

┌──────────────┐
│ VPS Node     │
│ CPU          │
│ RAM          │
│ Disk         │
│ Load         │
│ Upload       │
│ Download     │
│ Ping         │
│ Packet Loss  │
└──────────────┘
```

---

# 5. Aquar Tab 模型改造

建议给 Tab 增加 `type`。

示例：

```json
{
  "title": "控制台",
  "type": "grid",
  "widgets": []
}
```

新增：

```json
{
  "title": "可用性",
  "type": "komari",
  "widgets": [],
  "data": {
    "server": "/komari-api"
  }
}
```

未来还可以扩展：

```text
type: grid
type: komari
type: iframe
type: custom
```

但本次只实现：

```text
grid
komari
```

---

# 6. Gridtable.vue 改造

现在大概率类似：

```vue
<grid-layout>
  ...
</grid-layout>
```

修改为：

```vue
<template>
  <div>

    <grid-layout
      v-if="currentTab.type === 'grid'"
    >
      ...
    </grid-layout>

    <KomariMonitor
      v-else-if="currentTab.type === 'komari'"
      :config-data="currentTab.data"
    />

  </div>
</template>
```

引入：

```js
import KomariMonitor from '@/components/komari/KomariMonitor.vue'

export default {
  components: {
    KomariMonitor
  }
}
```

要求：

```text
原有 grid tab 行为必须完全保持不变
```

---

# 7. 建议目录结构

建议新增：

```text
aquar_home_front/src/

components/
└── komari/
    ├── KomariMonitor.vue
    ├── SummaryCard.vue
    ├── NodeCard.vue
    ├── CompactNodeCard.vue
    ├── MiniNodeCard.vue
    ├── MetricBar.vue
    ├── TrafficSection.vue
    ├── HealthSection.vue
    ├── TrendSparkline.vue
    └── PingSection.vue

services/
└── komari.js
```

如果 Komari 原项目组件更多，可以继续拆。

原则：

```text
不要把 Komari 所有组件全部复制
只复制 Monitor 页面实际需要的组件
```

---

# 8. Vue 3 -> Vue 2 改写原则

Komari 如果使用：

```vue
<script setup>
```

必须改成 Vue 2：

```js
export default {
  props: {},

  data() {
    return {}
  },

  computed: {},

  watch: {},

  mounted() {},

  beforeDestroy() {},

  methods: {}
}
```

---

## 8.1 ref

Vue 3：

```js
const nodes = ref([])
```

Vue 2：

```js
data() {
  return {
    nodes: []
  }
}
```

---

## 8.2 computed

Vue 3：

```js
const onlineNodes = computed(() =>
  nodes.value.filter(x => x.online)
)
```

Vue 2：

```js
computed: {
  onlineNodes() {
    return this.nodes.filter(x => x.online)
  }
}
```

---

## 8.3 mounted

Vue 3：

```js
onMounted(() => {
  loadNodes()
})
```

Vue 2：

```js
mounted() {
  this.loadNodes()
}
```

---

## 8.4 cleanup

Vue 3：

```js
onUnmounted(() => {
  socket.close()
})
```

Vue 2：

```js
beforeDestroy() {
  this.disconnectSocket()
}
```

---

# 9. Komari 数据访问

Komari Monitor 使用：

```text
JSON-RPC 2.0
```

主要接口：

```text
POST /api/rpc2
WS   /api/rpc2
```

需要重点参考以下 RPC：

```text
common:getNodes
common:getNodesLatestStatus
public:getPublicPingTasks
public:getPingRecords
```

Codex 应从 Komari-Home-Plus 源码中确认：

```text
具体 params 格式
返回值结构
节点字段
WebSocket 消息结构
错误处理逻辑
更新频率
```

不要猜字段。

---

# 10. komari.js

创建统一 API 层。

例如：

```js
export class KomariClient {

  constructor(baseUrl) {
    this.baseUrl = baseUrl
    this.ws = null
  }

  async rpc(method, params = {}) {
    // JSON-RPC POST
  }

  async getNodes() {
    return this.rpc('common:getNodes')
  }

  async getLatestStatus() {
    return this.rpc('common:getNodesLatestStatus')
  }

  async getPingTasks() {
    return this.rpc('public:getPublicPingTasks')
  }

  async getPingRecords(params) {
    return this.rpc('public:getPingRecords', params)
  }

  connectStatusStream(onMessage) {
    // WebSocket
  }

  disconnect() {
    // close socket
  }
}
```

所有 Komari 网络请求必须统一从这里走。

禁止散落：

```text
NodeCard.vue 自己 fetch
TrafficSection.vue 自己 fetch
PingSection.vue 自己 fetch
```

---

# 11. 推荐后端代理

最好不要让浏览器直接访问：

```text
https://komari.example.com/api/rpc2
```

建议 Aquar 暴露：

```text
/komari-api/
```

代理：

```text
/komari-api/rpc2
        ↓
https://komari.example.com/api/rpc2
```

同时代理 WebSocket。

目标：

```text
Aquar Browser
      |
      | /komari-api/rpc2
      v
Aquar Reverse Proxy
      |
      v
Komari Server
```

优点：

```text
避免 CORS
避免 Cookie 问题
避免 HTTPS / self-signed 证书问题
统一域名
WebSocket 更稳定
后续可以隐藏 Komari 地址
```

---

# 12. Nginx 示例

如果 Aquar 前面有 Nginx，可参考：

```nginx
location /komari-api/ {
    proxy_pass https://KOMARI_SERVER/api/;

    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

实际路径要根据 Komari 部署确认。

不要直接照抄上线。

---

# 13. UI 移植范围

保留：

```text
服务器监控标题
Online 节点
实时带宽
累计流量
资产概览

Node Card
Compact Card
Mini Card
List View

CPU
Memory
Disk
Load
Upload
Download
Ping
Packet Loss
Traffic

排序
视图切换
状态灯
流量趋势
```

---

# 14. 不移植的 UI

删除：

```text
Komari 顶部 Navbar
Komari Logo
首页
网址
监控
登录
独立主题按钮
Komari 页面 Footer
```

原因：

```text
Aquar 已经是主 Shell
Komari 这里只作为监控模块
```

---

# 15. 主题处理

Komari Monitor 应继承 Aquar。

不要保留 Komari 自己的：

```text
Light / Dark
```

优先：

```text
Aquar Dark Mode
        ↓
Komari Monitor 自动适配
```

如果 Aquar 没有统一 CSS Variable，可以先在 Komari 组件内使用兼容 Aquar 当前暗色主题的样式。

要求：

```text
视觉上必须像 Aquar 原生页面
不能像嵌了另一个网站
```

---

# 16. 第一阶段范围

第一阶段只完成：

```text
Aquar 新增可用性 Tab
Monitor Summary
Node Cards
实时状态
Ping
流量
排序
视图切换
响应式
```

节点点击行为：

```text
可以暂时无操作
```

或者：

```text
打开原 Komari 节点详情
```

不要第一阶段就迁移所有详情页。

---

# 17. 第二阶段

等第一阶段稳定后，再做：

```text
节点详情 Drawer
历史 CPU
历史内存
历史流量
历史 Ping
节点详情页
筛选
标签
区域分组
告警状态
```

不要和第一阶段一起做。

---

# 18. WebSocket 生命周期

必须正确处理：

```text
Tab 打开
    ↓
connect

页面销毁
    ↓
disconnect
```

并处理：

```text
自动重连
断线提示
重复连接
页面隐藏
组件销毁
```

必须避免：

```text
切换 Tab 后产生多个 WebSocket
```

---

# 19. 状态刷新策略

参考 Komari 原项目，不要自行创造过高频率。

建议：

```text
节点实时状态：
WebSocket

Ping：
约 60 秒更新

静态节点信息：
首次加载
必要时手动刷新
```

禁止：

```text
每秒全量 HTTP polling
```

---

# 20. 错误状态

必须设计以下状态：

```text
Loading
Empty
Connection Failed
WebSocket Disconnected
RPC Error
No Ping Data
Node Offline
```

例如：

```text
Komari 服务连接失败

[重新连接]
```

不要让整个 Aquar 页面白屏。

---

# 21. Responsive

必须验证：

```text
1920x1080
1440x900
1366x768
平板
手机
```

Desktop：

```text
3 column
```

较窄：

```text
2 column
```

Mobile：

```text
1 column
```

不要写死：

```css
width: 480px
```

---

# 22. 性能要求

不要：

```text
每个 Node 单独开 WebSocket
每个 Card 单独请求 API
每个组件重复计算全部节点
```

正确：

```text
KomariMonitor
    ↓
统一获取数据
    ↓
props
    ↓
NodeCard
```

即：

```text
Single Data Source
```

---

# 23. 建议状态结构

`KomariMonitor.vue`：

```js
data() {
  return {
    loading: true,

    nodes: [],
    statusMap: {},
    pingTasks: [],
    pingRecords: {},

    viewMode: 'card',
    sortBy: 'default',

    connected: false,
    error: null
  }
}
```

---

# 24. 建议计算属性

例如：

```js
computed: {

  onlineCount() {},

  totalCount() {},

  totalTraffic() {},

  realtimeBandwidth() {},

  totalAssetValue() {},

  sortedNodes() {}

}
```

UI 只负责显示。

---

# 25. 不要过度工程化

禁止本次顺手增加：

```text
Pinia
Vuex 重构
TypeScript 全量迁移
Vite
Tailwind
新的 UI Framework
GraphQL
Micro Frontend
Docker 架构重构
Aquar Backend 重构
```

原则：

> 只完成 Komari Monitor 集成所必需的改动。

---

# 26. Codex 工作顺序

Codex 必须按下面顺序执行。

## Step 1

分析 Aquar：

```text
Tab 数据结构
Gridtable.vue
Router
Vuetify
主题
配置加载
Dashboard Widget
```

输出：

```text
计划改哪些文件
每个文件改什么
```

此时不要立即大规模修改。

---

## Step 2

分析 Komari-Home-Plus：

找到：

```text
Monitor 主页面
Node Card
Metric Bar
Traffic
Ping
Sparkline
RPC client
WebSocket
排序
视图模式
```

输出：

```text
需要移植的文件
不需要移植的文件
RPC 方法
字段结构
```

---

## Step 3

实现 Aquar Full Page Tab。

先让：

```text
控制台
```

继续正常。

新增：

```text
可用性
```

先显示：

```text
Komari Monitor Placeholder
```

确认 Tab 架构没有破坏。

---

## Step 4

创建：

```text
components/komari/
services/komari.js
```

---

## Step 5

实现 HTTP RPC。

先让：

```text
getNodes()
```

能正确显示节点。

---

## Step 6

实现 WebSocket。

显示：

```text
CPU
Memory
Disk
Load
Upload
Download
Online
```

---

## Step 7

实现：

```text
Summary Cards
Node Cards
```

---

## Step 8

实现：

```text
Ping
Packet Loss
Traffic
Sparkline
```

---

## Step 9

实现：

```text
排序
Card / Compact / Mini / List
```

---

## Step 10

统一 Aquar 风格。

删除 Komari：

```text
Navbar
Footer
Theme Switch
Login
```

---

## Step 11

测试。

必须确认：

```text
控制台没有 regression
可用性正常
Tab 来回切换没有 WS 泄漏
Komari 离线时 Aquar 不崩
刷新页面正常
移动端正常
```

---

# 27. 验收标准

必须全部满足：

- [ ] Aquar 原有控制台功能正常
- [ ] 原有网址数据全部保留
- [ ] 原有图标数据全部保留
- [ ] 原有 Widget 配置全部保留
- [ ] 原有布局坐标全部保留
- [ ] 原有 Tab 在没有 type 字段时仍可正常运行
- [ ] 没有执行 destructive migration
- [ ] 新增“可用性”Tab
- [ ] 可用性 Tab 不使用 vue-grid-layout
- [ ] 页面原生 Vue 2 实现
- [ ] 不使用 iframe
- [ ] 不升级 Aquar Vue 3
- [ ] 不升级 Vuetify
- [ ] 不修改现有 Widget 架构
- [ ] 能读取 Komari Nodes
- [ ] 能读取实时状态
- [ ] WebSocket 正常
- [ ] 能显示 CPU
- [ ] 能显示 RAM
- [ ] 能显示 Disk
- [ ] 能显示 Load
- [ ] 能显示 Upload
- [ ] 能显示 Download
- [ ] 能显示 Ping
- [ ] 能显示 Packet Loss
- [ ] 能显示流量
- [ ] 支持排序
- [ ] 支持视图切换
- [ ] Komari 离线不导致 Aquar 白屏
- [ ] 切换 Tab 不产生 WebSocket 泄漏
- [ ] UI 与 Aquar 暗色主题一致
- [ ] Desktop 响应式正常
- [ ] Mobile 响应式正常

---

# 28. Git 提交建议

不要一个 commit 做完。

建议：

```text
feat(tabs): support full-page tab content

feat(komari): add rpc client

feat(komari): add monitor overview

feat(komari): add realtime node status

feat(komari): add ping and traffic metrics

feat(komari): add monitor view modes

style(komari): align monitor UI with Aquar theme

fix(komari): cleanup websocket lifecycle
```

---

# 29. 给 Codex 的最终 Prompt

下面可以直接复制给 Codex。

```text
I need you to integrate the monitoring UI from:

https://github.com/123nhh/Komari-Home-Plus

into:

https://github.com/ld0574/aquar-home

The target is Aquar's existing "可用性" tab.

IMPORTANT ARCHITECTURE DECISION:


DATA PRESERVATION IS CRITICAL

Aquar already contains a large amount of user-maintained production data,
including website URLs, icons, widgets, tab configuration, layout positions,
service addresses and custom names.

DO NOT delete, reset, rebuild, overwrite or destructively migrate any existing
Aquar user data.

In particular:

- preserve all existing website URL data
- preserve all existing icon data
- preserve all existing widget IDs
- preserve all existing tab IDs
- preserve all existing widget positions and layouts
- preserve all existing custom names and service URLs
- do not replace existing config files with defaults
- do not clear localStorage/database/config storage
- do not require existing data to be manually re-entered

Any schema extension must be backward compatible.

For example, if existing tabs do not have a `type` field, treat them as:

type = "grid"

in code, rather than migrating or rewriting all old data.

Example:

const tabType = tab.type || 'grid'

Only newly-created Komari tabs need the new type/data fields.

Before modifying any persistence layer, config schema, database model,
migration, JSON structure, or localStorage format, inspect how existing
Aquar data is stored.

If a destructive or non-trivial migration appears necessary, STOP and report
the issue before making that change.



Do NOT upgrade Aquar from Vue 2 to Vue 3.

Do NOT downgrade the entire Komari-Home-Plus application to Vue 2.

Do NOT embed Komari using iframe.

Do NOT import Vue 3 components directly into Aquar.

Instead, use Komari-Home-Plus only as a reference implementation and port
only the Monitor-related UI and data logic into native Vue 2 components
inside Aquar.

Aquar must remain:

- Vue 2
- Vue Router 3
- Vuetify 2
- existing vue-grid-layout
- existing Dashboard architecture

Do not refactor or modernize unrelated parts of Aquar.

GOAL

Aquar should have two types of tabs:

1. grid tab
   - existing Aquar dashboard
   - uses vue-grid-layout

2. komari tab
   - full-page monitor
   - does NOT use vue-grid-layout

Example:

控制台 | 可用性

控制台:
existing Aquar widgets

可用性:
Komari server monitoring page

The monitoring page should include:

- online node count
- realtime bandwidth
- cumulative traffic
- asset summary
- node cards
- CPU
- RAM
- Disk
- Load
- upload speed
- download speed
- Ping
- packet loss
- traffic usage
- status indicators
- sorting
- card / compact / mini / list view modes

Do NOT port:

- Komari navbar
- Komari homepage
- links page
- login navigation
- Komari footer
- Komari theme switcher

The monitor should visually look native to Aquar.

DATA

Inspect Komari-Home-Plus source code and reuse its actual JSON-RPC protocol.

Important RPC methods include:

common:getNodes
common:getNodesLatestStatus
public:getPublicPingTasks
public:getPingRecords

Komari uses:

POST /api/rpc2
WebSocket /api/rpc2

Do not guess params or response structures.
Read them from the Komari source.

Create a centralized client such as:

src/services/komari.js

Do not scatter fetch calls across components.

Suggested structure:

src/components/komari/
  KomariMonitor.vue
  SummaryCard.vue
  NodeCard.vue
  CompactNodeCard.vue
  MiniNodeCard.vue
  MetricBar.vue
  TrafficSection.vue
  HealthSection.vue
  TrendSparkline.vue
  PingSection.vue

Convert Vue 3 Composition API/script setup code to Vue 2 Options API.

For example:

ref -> data()
computed() -> computed
onMounted -> mounted
onUnmounted -> beforeDestroy

WebSocket lifecycle must be correct.

When Monitor is destroyed or tab changes:

close the WebSocket.

Do not allow duplicated WebSocket connections.

Handle:

- loading
- empty data
- RPC failure
- WebSocket disconnect
- Komari unavailable
- node offline
- no ping data

Komari failure must never crash the whole Aquar application.

RESPONSIVE

Desktop:
3 column cards

Medium:
2 column

Mobile:
1 column

Avoid fixed card widths.

IMPLEMENTATION ORDER

1. Inspect Aquar architecture.
2. Inspect Komari Monitor architecture.
3. Give me a short implementation plan and list of files to modify.
4. Implement support for full-page tab type.
5. Confirm existing Aquar grid tab still works.
6. Add Komari RPC client.
7. Add node loading.
8. Add realtime WebSocket status.
9. Add summary cards.
10. Add node cards.
11. Add ping / packet loss / traffic.
12. Add sorting and view mode.
13. Match Aquar visual style.
14. Test lifecycle and responsive layout.

Do not introduce:

- Vue 3
- Vuetify 3
- Pinia
- TypeScript migration
- Vite migration
- Tailwind
- micro frontend
- GraphQL
- unrelated backend refactors

Keep changes minimal and scoped.

Before writing a large amount of code, first inspect both projects and
report:

1. relevant Aquar files
2. relevant Komari files
3. exact RPC implementation
4. exact files you plan to add or modify
5. any compatibility issues you identify

Then implement in small steps.
```

---

# 30. 最重要的约束

如果 Codex 开始做下面这些事情，应立即停止：

```text
升级 Vue 3
升级 Vuetify
迁移 Vite
全量重构 Aquar
引入新状态框架
改写所有 Dashboard
直接 iframe
整个 Komari 降级
```

正确方向永远是：

```text
Aquar Vue 2 保持稳定

        +

Komari Monitor 业务/UI
局部 Vue 2 重实现
```

这次属于：

```text
Feature Integration
```

不是：

```text
Framework Migration
```
