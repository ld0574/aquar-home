# Aquar Home 部署指南

本文件负责 AquarHome 本身的部署。Komari 建议独立运行，请先阅读[Komari 部署与接入](komari-deployment.md)。

### 高度可定制的个人Home页，同时是强大的NAS服务控制台。

![responsive](https://raw.githubusercontent.com/firemakergk/aquar-home-helper/master/images/screenshot.jpg)

AquarHome(水瓶Home页)是一个强大可定制，其本身具备基础导航功能（如搜索框、导航链接）的同时还适配了多种NAS常用服务的API，集成了NextCloud、Docker、Syncthing、TrueNas等服务，可以在同一页面直接看到各个服务的核心数据与最新状态。

![action](https://raw.githubusercontent.com/firemakergk/aquar-home-helper/master/images/readme_action.gif)

AquarHome的核心特性：
- 适配各种开源服务api的组件
  - nextcloud文件浏览器
  - trueNas存储池状态监控
  - docker容器状态监控
  - Syncthing同步目录状态监控
  - PVE虚拟机状态监控
  - 基于rsync的文件增量备份组件
- 完善的Home页导航功能
  - 多尺寸的图标样式
  - 自定义上传图标
  - 自动抓取网站ico图标
  - 链接批量导入
  - 搜索框组件
- 页面适配移动端设备显示
- 所有组件大小位置可自定义
- 多标签页
- 同时支持登录信息验证与无登录验证
- 风格主题可选
- 背景图片可自定义

技术特性：
- vue+nodejs技术栈
- docker镜像
- 不依赖数据库

目前项目仍处于早期，更多组件已列入开发计划：
- todoList组件
- 日历组件
- 留言板&相册幻灯片
- rtsp推流监视器
- emby/jellyfin组件
- ...

## 快速开始

### Docker方式

AquarHome推荐使用 Docker Compose v2 部署。宿主机需要先安装 Docker Engine 和 Docker Compose，本文使用的新命令是 `docker compose`；如果你的环境只有旧版独立命令，也可以将下文的 `docker compose` 替换为 `docker-compose`。

#### 使用镜像部署

1.创建部署目录并准备数据、日志和文件同步目录：

```bash
mkdir -p aquarhome/data/cert aquarhome/aquarpool aquarhome/logs
cd aquarhome
```

2.在该目录创建 `.env` 文件。Komari 不是必选项；如果暂时不使用“可用性”Tab，可以先将 `KOMARI_SERVER` 留空。

```dotenv
# 使用 Docker Hub 镜像；如果不推送镜像，改为 aquarhome:local
AQUAR_IMAGE=ld0574/aquarhome:latest
AQUAR_PORT=8172

# 必须填写容器内部可以访问到的 Komari 地址；留空表示不启用 Komari
KOMARI_SERVER=
# 例如：Bearer your-komari-token
KOMARI_AUTHORIZATION=
KOMARI_PROXY_TIMEOUT=15000
TZ=Asia/Shanghai
```

3.在同一目录创建 `docker-compose.yml`：

```yaml
services:
  aquarhome:
    image: ${AQUAR_IMAGE:-ld0574/aquarhome:latest}
    container_name: aquarhome
    environment:
      PORT: ${AQUAR_PORT:-8172}
      TZ: ${TZ:-Asia/Shanghai}
      AQUAR_DATA_PATH: /var/aquardata
      KOMARI_SERVER: ${KOMARI_SERVER:-}
      KOMARI_AUTHORIZATION: ${KOMARI_AUTHORIZATION:-}
      KOMARI_PROXY_TIMEOUT: ${KOMARI_PROXY_TIMEOUT:-15000}
    volumes:
      - ./data:/var/aquardata
      - ./aquarpool:/opt/aquarpool
      - ./logs:/root/.pm2/logs
    ports:
      - "${AQUAR_PORT:-8172}:${AQUAR_PORT:-8172}/tcp"
      # 视频聊天组件使用 mediasoup；不需要视频聊天时可以删除这一行。
      - "10000-10100:10000-10100/udp"
      - "10000-10100:10000-10100/tcp"
    restart: unless-stopped
```

4.先校验 Compose 配置，再启动容器：

```bash
docker compose config
docker compose pull
docker compose up -d
docker compose ps
```

上面的方式会从 Docker Hub 使用 `ld0574/aquarhome:latest`。如果使用的是本仓库当前代码，请参阅下面的“从当前源码构建镜像”；本地构建的镜像不需要推送到 Docker Hub。

5.启动后访问 `https://<服务器地址>:8172`（如果修改了 `AQUAR_PORT`，使用对应端口）。AquarHome 默认使用自签名 HTTPS 证书，浏览器首次访问时出现证书警告属于正常现象；确认继续访问后即可进入登录页。

#### 从当前源码构建镜像

在本仓库根目录执行：

```bash
docker build --build-arg NPM_REGISTRY=https://registry.npmjs.org -t aquarhome:local .
```

构建完成后，将部署目录 `.env` 中的 `AQUAR_IMAGE` 改为 `aquarhome:local`：

```dotenv
AQUAR_IMAGE=aquarhome:local
```

然后在部署目录执行。`--pull never` 可确保 Compose 只使用本机已经构建好的镜像，不尝试从 Docker Hub 拉取：

```bash
docker compose up --pull never -d
docker compose ps
```

构建阶段使用统一的 Node 22，并构建前端与后端。前端仍使用旧版 Vue CLI / Webpack 4，因此构建命令会临时启用 OpenSSL legacy provider；这只影响构建阶段，不影响最终运行时。mediasoup 和 sharp 会优先下载预编译文件，下载不到时 builder 会回退到本地编译。首次构建可能需要较长时间和稳定的外网访问。

镜像名只是本机 tag，不代表镜像已经推送到仓库。也可以直接使用与 Docker Hub 相同的 tag 构建，但不执行 `docker push`：

```bash
docker build --build-arg NPM_REGISTRY=https://registry.npmjs.org -t ld0574/aquarhome:latest .
```

如果直接执行 `docker push` 时遇到 Docker Hub 网络问题，而又不希望修改 Docker daemon 的代理配置，可以让 `skopeo` 通过当前终端代理直接推送。部分 Debian 软件源中的旧版 skopeo 访问 `docker-daemon:` 时会使用过低的 Docker API 版本，因此这里使用 `docker save` 导出的归档文件作为输入：

```bash
export HTTP_PROXY=http://10.10.10.131:7890
export HTTPS_PROXY=http://10.10.10.131:7890
export ALL_PROXY=socks5h://10.10.10.131:7890

docker save -o /tmp/aquarhome-latest.tar ld0574/aquarhome:latest
skopeo login docker.io
skopeo copy \
  docker-archive:/tmp/aquarhome-latest.tar \
  docker://docker.io/ld0574/aquarhome:latest
```

这种方式不会改变 `/etc/docker/daemon.json`，因此不会影响 Docker 已配置的镜像加速器。若还要推送固定版本 tag，先使用 `docker tag` 和 `docker save` 导出对应 tag，再将目标地址中的 `latest` 替换为该版本号。

将 `.env` 中的 `AQUAR_IMAGE` 保持为 `ld0574/aquarhome:latest`，再执行：

```bash
docker compose up --pull never -d
```

如果要在另一台服务器使用本地构建的镜像，也不需要推送到 Docker Hub，可以导出并导入镜像：

```bash
# 当前项目根目录
docker save -o aquarhome.tar aquarhome:local
scp aquarhome.tar user@server:/tmp/
```

在目标服务器执行：

```bash
docker load -i /tmp/aquarhome.tar
# 部署目录 .env 中使用 AQUAR_IMAGE=aquarhome:local
docker compose up --pull never -d
```

#### Komari 可用性页配置

AquarHome 内置的“可用性”Tab 通过后端代理访问 Komari。服务地址、Secret、网络拓扑、Agent 安装和排障方法请参阅[Komari 部署与接入](komari-deployment.md)。

#### 数据、证书、升级与日志

所有需要持久化的数据都在宿主机的 `./data` 目录中，包含核心配置、上传图片、缓存和证书。自定义 HTTPS 证书请放入 `./data/cert/`，并严格命名为：

```text
./data/cert/aquarhome.crt
./data/cert/aquarhome.key
```

证书必须是 PEM 格式；只放入其中一个文件时，程序会继续使用内置证书。升级前建议备份 `./data`，然后执行：

```bash
docker compose pull
docker compose up -d
```

不要使用 `docker compose down -v`，否则可能删除 Compose 管理的卷。当前示例使用 bind mount，容器删除或重建不会删除 `./data`。

查看日志：

```bash
docker compose logs -f --tail=200 aquarhome
```

排查启动问题时，优先检查以下项目：

- `docker compose config` 是否能成功解析，尤其是 `.env` 中的特殊字符。
- `docker compose ps` 中容器是否处于 `Up` 状态。
- `./data`、`./aquarpool` 和 `./logs` 是否存在且可写。
- 访问地址是否使用 HTTPS，以及宿主机防火墙是否放行 `AQUAR_PORT`。
- Komari 是否从容器内部可达；未配置或不可达时只会影响“可用性”页。

### 源码方式

如果你的环境不方便使用docker，或者你需要根据自己的需求修改AquarHome的代码，可以使用源码方式部署AquarHome。但由于对mediasoup流媒体服务组件的集成，搭建环境较为繁琐，若你不是开发者则不建议以这种方式部署。

1.由于集成了流媒体服务组件mediasoup，其安装过程中依赖python3环境、配套的pip工具以及gcc等C语言编译工具，AquarHome统一使用nodejs 22及匹配版本的npm，强烈建议在linux环境下安装，以下建议也按照linux环境给出，安装根据mediasoup的文档要求，AquarHome需要如下环境：
  1) Node.js 22及匹配版本的npm。
  2) python version>=3.6及匹配版本的pip命令。
  3) GNU make
  4) gcc and g++ >= 4.9 或 clang (with C++11 support)
  5) 与第4项相对应的cc and c++ 命令
  6) 中国大陆需要外网访问能力，否则安装mediasoup的脚本无法正常下载必需的组件。

2.从github或码云上下载源码，如果你有git，可以直接使用git clone下载源码。此外也可以在页面上下载zip文件然后在服务器上解压。
```
git clone https://github.com/ld0574/aquar-home.git
```

3.进入到项目目录下，执行如下语句。脚本每一步都有解释，你可以根据自己的情况自行增减。

``` bash
sudo -i # 以管理员身份进行操作
npm config set registry https://registry.npm.taobao.org # 将下载源切换为国内npm源
npm install -g pm2 # 安装pm2，作为运行nodejs的容器
cd /path/to/aquar-home
cd aquar_home_front # 进入前端项目目录
npm ci # 按锁文件安装依赖
NODE_OPTIONS=--openssl-legacy-provider npm run build # 构建前端项目
cd ../aquar_home_server # 进入后端项目
rm -rf public/static/ # 清空原有静态资源文件，下两行同义
rm -rf public/favicon.ico
rm -rf public/index.html
cp -r ../aquar_home_front/dist/* public/ # 将打包好的前端项目拷贝进后端项目中
npm ci --omit=dev # 按锁文件安装后端生产依赖
npm run prd # 调用pm2运行项目
```

## 更进一步

AquarHome的开发理念是尽可能轻量化，所以采用了纯javascript的技术栈。在数据存储上摒弃了数据库，采用配置文件的方式进行数据持久话，这除了带来架构上的轻量以外，也使系统的配置数据有了极高的可读性与可移植性，可以方便的手动维护与迁移。

进入数据目录(docker容器中/var/aquardata的宿主机挂载点)后可以看到目录结构大致如下：

```
.
├── bg_img   <====背景图上传目录
│   └── 999af70a4c8bf2d3f9c9f26145ba6cc9.webp
├── cache <====组件缓存目录
│   └── nextcloud
│       └── thumb <====NextCloud组件的缩略图缓存
│           ├── 01e2faad43078be9022130aeaaa2505d.webp
│           ├── 03ac2910226dd17cbb436978d908d852.webp
│           ├── 0550386419f81fa4c89eb499fa8431b8.webp
│           ...
├── cert <====自定义ssl证书目录，若为空则采用系统内置证书，若需要自定义证书，则证书必须以aquarhome.key/crt命名，且采用pem格式。
│   ├── aquarhome.crt
│   └── aquarhome.key
├── db <====AquarHome的核心配置数据
│   └── db.json
├── icon_img <====图标文件目录，包括上传的与自动抓取的图标
│   ├── 0b6a2e93ae151351.ico
│   ├── 7ca77f3c376d9412.ico
│   ├── 850ce3dbe85b1c3e04b5a4d41c97249d.webp
│   ├── 86bd2266437333aa.ico
│   ├── 87a178c91ca60635.ico
│   ...
└── log <====日志目录

```

其中/db/db.json是AquarHome的核心配置文件，文件格式是json，内容也简单易懂，我在上面进行简单地标注后你应该可以很容易地明白各项配置的意思。
``` json
{
  "auth": { # 权限验证信息，包含了系统自动生成的密钥，以及用户自定义的用户名与密码的MD5散列值
    "secret": "p3xkCUbUte",
    "userName": "firemaker",
    "password": "3b774fe4f5d86e9b112789a2708e1e91"
  },
  "config": { # 系统配置信息，包含了背景图片、背景虚化值、主题方案及背景颜色
    "current_index": 0,
    "appearance": {
      "bgColor": "#455A65",
      "bgImg": "/bg_img/6bf762336ffa3a8b2cd39474d2bbdc7c.webp",
      "bgBlur": "0",
      "theme": "defaultLight"
    }
  },
  "tabs": [ # 标签页数据，包含了标签页的标题及内涵的所有组件
    {
      "title": "导航",
      "widgets": [ # 组件列表
        {
          "id": "cbaf8dda-8e77-4ab4-a328-c13f78b2c386", # 组件的唯一id值
          "sort": 1, #排序属性，暂时未使用
          "name": "syncthing local", # 组件的名称
          "href": "http://localhost:8384", # 链接地址
          "image": "img/nextcloud.jpg", # 组件的图标地址
          "widget": "SyncthingWidget", # 标记这是一个Syncthing组件
          "layout": { # 标记其所在的座标及大小
            "x": 4,
            "y": 2,
            "w": 3,
            "h": 4,
            "i": "cbaf8dda-8e77-4ab4-a328-c13f78b2c386",
            "moved": false
          },
          "data": {
            "server": "http://localhost:8384", # 服务器地址
            "app_key": "mESCgd6imiPvTfVGojshHRSwcAd9SYzp" # 用户自行配置的app_key,用来通过syncthing接口的鉴权
          }
        }
      ]
    }
  ]
}
```

这种设计不仅可以让你更有力地掌控整个系统，也可以在需要时对系统进行快速的迁移，你只需要将整个数据目录打包，放在想要迁移的地方即可，或者只把db.json文件带走，在新系统里重新上传一遍图标。一切都可见可控。

## 相关文档

- [Komari 部署与接入](komari-deployment.md)
- [开发指南](development.md)
- [文档索引](README.md)
