# syntax=docker/dockerfile:1.7
# Aquar Home - compatibility focused multi-stage build
#
# Frontend:
#   Legacy Vue CLI / Webpack 4 -> Node 22
#   Webpack 4 still requests the MD4 hash disabled by OpenSSL 3, so the
#   legacy provider is enabled only for the frontend build command.
#
# Backend/runtime:
#   mediasoup 3.26.x -> Node >= 22
#
# Debian slim is used for all stages so the backend's native dependencies
# share the same glibc-based Linux environment during build and runtime.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL=https://ghfast.top/https://github.com/versatica/mediasoup/releases/download

# ============================================================
# 1) Legacy frontend builder
# ============================================================
FROM ${NODE_IMAGE} AS frontend-builder

ARG NPM_REGISTRY

WORKDIR /app/aquar_home/aquar_home_front

RUN npm config set registry "${NPM_REGISTRY}"

COPY ./aquar_home_front/package.json ./aquar_home_front/package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY ./aquar_home_front/ ./

RUN NODE_OPTIONS=--openssl-legacy-provider npm run build


# ============================================================
# 2) Backend dependency builder
#    mediasoup 3.26.x requires Node >= 22.
#    Debian/glibc is used so mediasoup can fetch a prebuilt worker.
# ============================================================
FROM ${NODE_IMAGE} AS backend-builder

ARG NPM_REGISTRY

WORKDIR /app/aquar_home/aquar_home_server

RUN npm config set registry "${NPM_REGISTRY}"

# The worker is downloaded explicitly below. Since this image is intended to
# use the prebuilt worker, do not install the large C++/Meson fallback toolchain
# and do not spend 20+ minutes compiling when the download endpoint is slow.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       tar \
    && rm -rf /var/lib/apt/lists/*

COPY ./aquar_home_server/package.json ./aquar_home_server/package-lock.json ./

# Let npm install the other packages normally, but prevent mediasoup from
# starting its own network download here. Its worker is fetched explicitly
# below so a slow/unreachable GitHub endpoint cannot trigger a long local
# Meson/C++ fallback build.
RUN --mount=type=cache,target=/root/.npm \
    export MEDIASOUP_WORKER_BIN="${PWD}/node_modules/mediasoup/worker/out/Release/mediasoup-worker" \
    && npm ci --omit=dev --include=optional

# Keep this ARG after npm ci so changing the mirror only reruns this small
# download layer instead of reinstalling every backend dependency.
ARG MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL
RUN set -eux; \
    base_url="${MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL%/}"; \
    worker_version="$(node -p "require('./node_modules/mediasoup/package.json').version")"; \
    worker_arch="$(node -p "process.arch")"; \
    kernel_major="$(uname -r | cut -d. -f1)"; \
    worker_name="mediasoup-worker-${worker_version}-linux-${worker_arch}-kernel${kernel_major}.tgz"; \
    worker_path="${PWD}/node_modules/mediasoup/worker/out/Release/mediasoup-worker"; \
    worker_archive="/tmp/${worker_name}"; \
    worker_url="${base_url}/${worker_version}/${worker_name}"; \
    echo "下载 mediasoup 预编译 worker：${worker_url}"; \
    mkdir -p "$(dirname "${worker_path}")"; \
    curl --fail --silent --show-error --location \
      --connect-timeout 10 --max-time 120 --retry 2 --retry-delay 1 \
      --output "${worker_archive}" "${worker_url}"; \
    tar -xzf "${worker_archive}" -C "$(dirname "${worker_path}")"; \
    rm -f "${worker_archive}"; \
    chmod 0755 "${worker_path}"; \
    worker_status=0; \
    "${worker_path}" >/dev/null 2>&1 || worker_status=$?; \
    test "${worker_status}" -eq 41

COPY ./aquar_home_server/ ./

# Replace backend public directory with the freshly built frontend.
RUN rm -rf ./public \
    && mkdir -p ./public

COPY --from=frontend-builder \
    /app/aquar_home/aquar_home_front/dist/. \
    ./public/

# sharp 0.34 distributes its native addon and libvips as optional npm packages.
RUN node -e "require('sharp')"


# ============================================================
# 3) Runtime
# ============================================================
FROM ${NODE_IMAGE} AS runtime

ARG NPM_REGISTRY

WORKDIR /app/aquar_home

RUN npm config set registry "${NPM_REGISTRY}" \
    && npm install -g pm2@7.0.4 \
    && npm cache clean --force

COPY --from=backend-builder \
    /app/aquar_home/aquar_home_server/ \
    ./

EXPOSE 8172

VOLUME ["/var/aquardata"]
VOLUME ["/opt/aquarpool"]
VOLUME ["/root/.pm2/logs"]

CMD ["/bin/sh", "-c", "mkdir -p /var/aquardata/log/ /root/.pm2/logs && cd /app/aquar_home && exec npm run dcprd > /root/.pm2/logs/aquar_home.log 2>&1"]
