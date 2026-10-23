# NAMP portal image. Build from the repo root (all workspaces live here):
#   docker build -t namp .
#
# The hashing addon (native/) is a NAN module needing a C++20 toolchain.
# Debian 13 (trixie) ships GCC 14; the known-answer vectors are verified on
# GCC 12, 13 and 14, and the tests pass on Node 22, 24 and 26. Node 24 is the
# LTS line the production deployments run.
FROM node:24-trixie

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

# Install the whole workspace tree first for better layer caching. npm resolves
# the workspace graph from the manifests, and the native addon compiles during
# install, so its sources come along; .npmrc carries the legacy-peer-deps
# setting the web SPA needs.
COPY package.json package-lock.json .npmrc binding.gyp ./
COPY native/ ./native/
RUN npm ci

# Sources. .dockerignore keeps host build output (build/, web/dist) and the
# operator's own config.json / pool_configs / coins out: the image compiles
# the addon and the SPA itself, and configuration is mounted at runtime.
COPY . .

# Build the Vite + React SPA that the website worker serves from web/dist.
RUN npm run build


# Website (8080) and CLI listener (cliPort, 17117 in config_example.json).
# These must match your config; stratum ports are per-pool, publish them in
# docker-compose as needed.
EXPOSE 8080 17117

# Point Redis at the compose service by default; override per environment.
ENV REDIS_HOST=redis \
    REDIS_PORT=6379

# Plain Node: the whole backend is buildless TypeScript run through Node's
# native type stripping (erasableSyntaxOnly) — no loader involved.
CMD ["node", "src/init.ts"]
