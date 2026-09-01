# Aquar Home

高度可定制的个人 Home 页，同时也是一个 NAS 服务控制台。项目使用 Vue 2 + Node.js，支持 Docker 部署，并集成了多个常用家庭服务组件。

项目地址：[github.com/ld0574/aquar-home](https://github.com/ld0574/aquar-home)

## 文档

- [部署指南](docs/deployment.md)：Docker、源码部署、镜像发布、数据目录和升级方法。
- [Komari 部署与接入](docs/komari-deployment.md)：单独部署 Komari Server、安装 Agent，以及接入 AquarHome。
- [开发指南](docs/development.md)：前端、后端、Node.js 22 和本地构建命令。
- [Komari 监控页集成方案](docs/komari-integration-plan.md)：监控页的架构和实现记录。
- [待办事项](docs/todo.md)
- [脚本说明](scripts/README.md)

## 核心特性

- NextCloud、Docker、Syncthing、TrueNAS、PVE 等服务组件
- 可自定义的图标、背景、主题、布局和多标签页
- 响应式移动端界面
- Komari 服务器监控页，可通过后端代理访问
- Docker 镜像使用统一的 Node.js 22 构建和运行
- 配置文件持久化，不依赖独立数据库

## 目录约定

```text
docs/       项目部署、开发、集成和运维文档
scripts/    部署、初始化和系统运维脚本
aquar_home_front/  Vue 2 前端
aquar_home_server/ Node.js 后端
```

默认 Docker Hub 镜像为 `ld0574/aquarhome:latest`。首次部署建议从[部署指南](docs/deployment.md)开始；如果要启用监控页，再阅读 [Komari 部署与接入](docs/komari-deployment.md)。
