# 项目脚本

所有项目级部署和运维脚本集中在本目录。脚本大多是历史环境脚本，默认面向 Ubuntu、root 用户和旧版 `docker-compose`；新部署优先按照 [部署指南](../docs/deployment.md) 使用 Docker Compose v2。

| 脚本 | 用途 | 备注 |
| --- | --- | --- |
| `deploy_docker.sh` | 拉取源码、构建 AquarHome 镜像并启动旧版 Compose 环境 | 传入 `push` 会尝试推送 Docker Hub |
| `redeploy.sh` | 源码方式重新构建前端并重启后端 | 依赖 PM2 和现有部署路径 |
| `setup_aquar.sh` | 初始化 NFS、Docker、Python 虚拟环境和家庭服务 Compose | 主要面向旧 Ubuntu 环境 |
| `setupbuildenv.sh` | 初始化打包/构建环境 | 会修改 apt、Docker 和系统服务配置，执行前请审阅 |
| `setupproxy.sh` | 初始化 OpenVPN 代理节点 | 会安装 Docker 并修改系统服务配置 |
| `ipupdater.py` | 更新 PVE 网络相关的本机配置 | 需要 root 和 `python3-netifaces` |
| `truenasseeker.py` | 扫描局域网并尝试发现 TrueNAS/NFS | 需要 root、nmap、scapy 等 Python 依赖 |
| `sync_phase.sh` | 生成 rsync 增量归档 | 组件历史脚本，当前后端主要使用内置 rsync 服务 |

## 常用调用

```bash
# 在仓库根目录执行
bash scripts/deploy_docker.sh
bash scripts/redeploy.sh
bash scripts/setup_aquar.sh <NFS服务器地址>
bash scripts/setupbuildenv.sh <仓库地址>
bash scripts/setupproxy.sh <公网IP>

sudo python3 scripts/ipupdater.py
sudo python3 scripts/truenasseeker.py
bash scripts/sync_phase.sh --source-dir=/path/to/source
```

`setup_aquar.sh`、`setupbuildenv.sh` 和 `setupproxy.sh` 会写入 `/etc`、`/usr/local/bin`、`/lib/systemd` 等系统路径，不能在不审阅的情况下直接执行。脚本归档位置变化后，systemd 服务中的 `ExecStart` 路径也应指向 `scripts/` 下的新位置。
