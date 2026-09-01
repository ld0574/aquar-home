# Komari 部署与 AquarHome 接入

本文只说明 Komari 的部署、Agent 接入和 AquarHome 配置。Komari 不会打包进 AquarHome 镜像，建议作为独立服务部署；这样可以单独升级、备份和管理监控数据。

## 1. 推荐网络拓扑

Komari Agent 运行在被监控服务器上，主动连接 Komari Server 上报数据。通常不需要给每台被监控服务器开放入站端口。

根据服务器分布选择拓扑：

- **同一内网或同一 VPN**：Komari Server、AquarHome 和各服务器都在内网，使用内网地址即可，不必公网暴露。
- **服务器分散在不同机房/家庭网络**：将 Komari Server 部署在一台有公网入口的服务器，或让各网络通过 WireGuard、Tailscale 等组网。只对外提供 Komari 的 HTTPS 入口，Agent 通过出站连接接入。
- **AquarHome 与 Komari 分开部署**：AquarHome 容器必须能访问 Komari Server；Agent 也必须能访问 Komari Server。两者不要求在同一个 Docker Compose 项目中。

可以把流量关系理解为：

```text
被监控服务器上的 Komari Agent ──主动连接──> Komari Server
                                                   ^
                                                   │ AquarHome 后端代理请求
                                                   └── AquarHome 容器
```

如果只把 Komari 地址配置在个人电脑浏览器中可访问，但 AquarHome 容器访问不到，AquarHome 的“可用性”页仍然会报连接失败。

## 2. 使用 Docker 部署 Komari Server

Komari 官方默认端口是 `25774`，数据目录挂载到 `/app/data`。下面使用独立目录，容器删除或升级不会影响监控数据：

```bash
mkdir -p /opt/komari/data
cd /opt/komari

docker run -d \
  --name komari \
  --restart unless-stopped \
  -p 25774:25774 \
  -v /opt/komari/data:/app/data \
  ghcr.io/komari-monitor/komari:latest

docker logs -f komari
```

也可以在 `/opt/komari/docker-compose.yml` 中使用 Compose：

```yaml
services:
  komari:
    image: ghcr.io/komari-monitor/komari:latest
    container_name: komari
    restart: unless-stopped
    ports:
      - "25774:25774"
    volumes:
      - ./data:/app/data
```

启动和检查：

```bash
docker compose up -d
docker compose ps
docker compose logs -f komari
```

首次访问 `http://<Komari服务器地址>:25774`，按向导创建管理员账号。生产环境建议通过反向代理提供 HTTPS，并限制管理入口的访问来源。

官方参考：[快速安装](https://komari-monitor.github.io/komari-document/install/quick-start.html)、[Docker 部署](https://komari-monitor.github.io/komari-document/install/docker.html)。

## 3. 安装 Komari Agent

在 Komari 管理界面中创建或查看节点，然后使用界面提供的 Agent 安装命令。不同系统和架构应使用对应的 Agent 文件，不要把一个架构的二进制复制到另一种架构。

手动运行的最小形式如下，`endpoint` 填 Komari Server 的访问地址，`token` 使用 Komari 为该节点生成的 Token：

```bash
./komari-agent \
  --endpoint "https://komari.example.com" \
  --token "<AGENT_TOKEN>"
```

Agent 也支持环境变量或 JSON 配置文件：

```bash
export AGENT_ENDPOINT="https://komari.example.com"
export AGENT_TOKEN="<AGENT_TOKEN>"
./komari-agent
```

如果直接运行 Agent，退出 SSH 后进程可能停止。生产环境应使用 Komari 安装脚本生成的 systemd 服务，或自行配置 systemd、Docker Compose 等保活方式。官方 Agent 参数说明见 [komari-agent README](https://github.com/komari-monitor/komari-agent/blob/main/readme.md)。

检查 Agent 到 Server 的网络连通性：

```bash
curl -I https://komari.example.com
nc -zv komari.example.com 25774
```

若使用自签名 HTTPS 证书，需要按 Agent 版本支持的方式开启忽略不安全证书选项；更推荐使用受信任的证书。

## 4. 在 AquarHome 中配置

登录 AquarHome，打开 **设置 → Komari设置**：

1. **Komari 服务地址**填写 AquarHome 后端能够访问的地址，例如 `http://192.168.1.20:25774` 或 `https://komari.example.com`。
2. **Komari Secret**填写 Komari API 使用的 Token；可以填原始 Token，也可以填完整的 `Bearer <Token>`。
3. 保存后打开“可用性”Tab，检查节点是否出现。

AquarHome 会通过后端代理访问 Komari，浏览器不会直接拿到 Komari Secret。Secret 保存后不会回显；留空保存表示保持原值，勾选清除才会删除。

服务地址支持根地址和带反向代理前缀的地址：

```text
http://komari:25774
http://192.168.1.20:25774
https://komari.example.com
https://example.com/komari
```

如果 Komari 与 AquarHome 是两个独立 Compose 项目，`http://komari:25774` 通常不能直接解析；请使用宿主机/LAN 地址，或把两个 Compose 项目接入同一个 Docker 网络。

## 5. 环境变量回退配置

不方便从前端配置时，可以在 AquarHome 的 `.env` 中设置：

```dotenv
KOMARI_SERVER=https://komari.example.com
KOMARI_AUTHORIZATION=Bearer <TOKEN>
KOMARI_PROXY_TIMEOUT=15000
```

对应的 Compose 服务需要把这些变量传给 AquarHome 容器。前端保存的配置优先于环境变量；空的数据库配置会回退到环境变量，因此可以先用环境变量完成首次部署，再从前端接管配置。

## 6. 数据、升级与排障

- Komari 数据：备份 `/opt/komari/data`，不要使用 `docker compose down -v`。
- AquarHome 数据：备份部署目录挂载的 `./data`，其中包含 `db/db.json`、证书、背景和图标。
- 升级 Komari：先备份数据，再执行 `docker compose pull && docker compose up -d`；不要删除数据目录。
- AquarHome 页面提示未配置：检查前端是否保存了服务地址，或 `.env` 是否包含 `KOMARI_SERVER`。
- 页面提示连接失败：从 AquarHome 容器内部检查 DNS、路由和端口，不要只在宿主机上测试。
- 页面提示鉴权失败：重新从 Komari 获取 Token，确认 Secret 是 API Token，而不是登录密码。
- 查看 AquarHome 日志：`docker compose logs -f --tail=200 aquarhome`。

## 7. 官方资料

- [Komari 快速安装](https://komari-monitor.github.io/komari-document/install/quick-start.html)
- [Komari Docker 教程](https://komari-monitor.github.io/komari-document/install/docker.html)
- [Komari Agent 配置](https://github.com/komari-monitor/komari-agent/blob/main/readme.md)
- [Agent 信息上报与连接说明](https://komari-monitor.github.io/komari-document/dev/agent.html)
