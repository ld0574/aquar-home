#!/usr/bin/env bash

# Pull the latest source, build the local image and recreate AquarHome.
# Run this script from any directory on a server that has this repository.

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
IMAGE_NAME="${AQUAR_IMAGE:-ld0574/aquarhome:latest}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL="${MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL:-https://ghfast.top/https://github.com/versatica/mediasoup/releases/download}"
NO_CACHE=0
STOP_FIRST=0

usage() {
  cat <<'EOF'
用法：
  bash scripts/update_docker.sh [选项]

选项：
  --no-cache    不使用 Docker 构建缓存
  --down        构建前执行 docker compose down（默认不中断现有容器）
  -h, --help    显示帮助

环境变量：
  NPM_REGISTRY  npm 源，默认 https://registry.npmmirror.com
  MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL  mediasoup worker 加速地址，默认使用 ghfast
  HTTP_PROXY/HTTPS_PROXY/NO_PROXY  可选，转发给 Docker 构建阶段的网络请求
  AQUAR_IMAGE   镜像名，默认 ld0574/aquarhome:latest
EOF
}

while (($# > 0)); do
  case "$1" in
    --no-cache)
      NO_CACHE=1
      ;;
    --down)
      STOP_FIRST=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

fail() {
  echo "更新失败：$1" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail '未找到 git'
command -v docker >/dev/null 2>&1 || fail '未找到 docker'
docker compose version >/dev/null 2>&1 || fail '未找到 Docker Compose v2，请安装 docker compose 插件'

cd "$REPO_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail '工作区有未提交改动，请先处理后再更新，避免 git pull 覆盖本地修改'
fi

echo "[1/4] 拉取最新代码"
git pull --ff-only

echo "[2/4] 校验 Compose 配置"
docker compose config --quiet

if (( STOP_FIRST )); then
  echo "[3/4] 停止现有容器"
  docker compose down
else
  echo "[3/4] 保持现有容器运行，构建完成后直接重建"
fi

echo "[4/4] 构建镜像并启动"
build_args=(
  --build-arg "NPM_REGISTRY=${NPM_REGISTRY}"
  --build-arg "MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL=${MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL}"
  -t "$IMAGE_NAME"
)
if (( NO_CACHE )); then
  build_args=(--no-cache "${build_args[@]}")
fi

# Docker's predefined proxy build args let npm and other build steps share a
# proxy when the host has one configured for this shell.
for proxy_var in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; do
  if [[ -n "${!proxy_var:-}" ]]; then
    build_args+=(--build-arg "${proxy_var}=${!proxy_var}")
  fi
done

docker build "${build_args[@]}" "$REPO_ROOT"
docker compose up -d --pull never --force-recreate
docker compose ps

echo "更新完成：${IMAGE_NAME}"
