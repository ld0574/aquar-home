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
ARG MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL=https://gh-proxy.com/https://github.com/versatica/mediasoup/releases/download,https://ghfast.top/https://github.com/versatica/mediasoup/releases/download,https://github.com/versatica/mediasoup/releases/download

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

# The worker is downloaded explicitly below through the existing axios
# dependency, so this stage needs no apt repository access or external tool.

COPY ./aquar_home_server/package.json ./aquar_home_server/package-lock.json ./

# Let npm install the other packages normally, but prevent mediasoup from
# starting its own network download here. Its worker is fetched explicitly
# below so a slow/unreachable GitHub endpoint cannot trigger a long local
# Meson/C++ fallback build.
RUN --mount=type=cache,target=/root/.npm \
    export MEDIASOUP_WORKER_BIN="${PWD}/node_modules/mediasoup/worker/out/Release/mediasoup-worker" \
    && npm ci --omit=dev --include=optional

COPY ./scripts/ ./build-scripts/

# Keep this ARG after npm ci so changing the mirror only reruns this small
# download layer instead of reinstalling every backend dependency.
ARG MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL
RUN --mount=type=cache,id=aquar-mediasoup-worker,target=/root/.cache/aquar-mediasoup-worker,sharing=locked \
    MEDIASOUP_WORKER_LOCAL_ARCHIVE_DIR="${PWD}/build-scripts" \
    MEDIASOUP_WORKER_CACHE_DIR=/root/.cache/aquar-mediasoup-worker \
    MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL="${MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL}" \
    node ./build-scripts/install_mediasoup_worker.mjs \
    && rm -rf ./build-scripts

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
