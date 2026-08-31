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

# ============================================================
# 1) Legacy frontend builder
# ============================================================
FROM ${NODE_IMAGE} AS frontend-builder

ARG NPM_REGISTRY

WORKDIR /app/aquar_home/aquar_home_front

RUN npm config set registry "${NPM_REGISTRY}"

COPY ./aquar_home_front/ ./

RUN npm ci \
    && NODE_OPTIONS=--openssl-legacy-provider npm run build \
    && npm cache clean --force


# ============================================================
# 2) Backend dependency builder
#    mediasoup 3.26.x requires Node >= 22.
#    Debian/glibc is used so mediasoup can fetch a prebuilt worker.
# ============================================================
FROM ${NODE_IMAGE} AS backend-builder

ARG NPM_REGISTRY

WORKDIR /app/aquar_home/aquar_home_server

RUN npm config set registry "${NPM_REGISTRY}"

# mediasoup and sharp normally use prebuilt artifacts. Keep a build-tool
# fallback in this builder for servers where the prebuilt download is blocked
# or unavailable for the target architecture/kernel. These packages do not
# reach the final runtime image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       python3 \
       python3-pip \
       make \
       g++ \
       pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY ./aquar_home_server/ ./

# Replace backend public directory with the freshly built frontend.
RUN rm -rf ./public \
    && mkdir -p ./public

COPY --from=frontend-builder \
    /app/aquar_home/aquar_home_front/dist/. \
    ./public/

# Install the locked production dependency tree only.
RUN npm ci --omit=dev \
    && npm cache clean --force


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
