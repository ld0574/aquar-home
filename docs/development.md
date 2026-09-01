# Aquar Home 开发指南

## 环境要求

- Node.js 22.x；前端和后端统一使用这一版本。
- npm 10.x，与 Node.js 22 配套。
- 后端的 mediasoup 需要 Python 3、`make`、`gcc/g++` 等原生编译工具。
- 推荐在 Debian/Ubuntu 的 x86_64 或 arm64 环境中执行安装和构建。

本地开发时也可以使用更高版本 Node.js，但发布镜像和生产验证以 Dockerfile 中的 Node.js 22 为准。前端仍是 Vue 2、Vue CLI 4 和 Webpack 4，构建时需要临时启用 OpenSSL legacy provider。

## 前端开发

```bash
cd aquar_home_front
npm ci
npm run serve
```

生产构建和检查：

```bash
cd aquar_home_front
NODE_OPTIONS=--openssl-legacy-provider npm run build
npm run lint
```

## 后端开发

```bash
cd aquar_home_server
npm ci
NODE_ENV=dev npx babel-node ./index.js
```

后端生产依赖和运行：

```bash
cd aquar_home_server
npm ci --omit=dev
npm run prd
```

后端默认使用 HTTPS 和项目内置证书。开发时如果需要完整验证 mediasoup，请确保系统原生编译工具和网络下载条件满足。

## 将前端构建结果交给后端

源码部署时，前端构建结果需要复制到后端的 `public/`：

```bash
rm -rf aquar_home_server/public/static
rm -f aquar_home_server/public/favicon.ico aquar_home_server/public/index.html
cp -r aquar_home_front/dist/. aquar_home_server/public/
```

Docker 构建不需要手动复制，Dockerfile 会在 builder 阶段完成这一步。

## 推荐验证

在提交前执行：

```bash
git diff --check
NODE_OPTIONS=--openssl-legacy-provider npm --prefix aquar_home_front run build
node --check aquar_home_server/app.js
```

更完整的部署检查请参阅[部署指南](deployment.md)，Komari 相关检查请参阅[Komari 部署与接入](komari-deployment.md)。
