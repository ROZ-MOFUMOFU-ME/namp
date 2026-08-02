# NAMP portal image. Build from the repo root (all workspaces live here):
#   docker build -t namp .
#
# multi-hashing is a NAN native addon needing a C++20 toolchain; node:24-bookworm
# ships GCC 12, the version the hashing vectors are verified against.
FROM node:24-bookworm

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

# Sources (config.json / pool_configs / coins are mounted at runtime).
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

# Run via the tsx loader: the workspace deps ship TypeScript and Node's built-in
# type-stripping refuses .ts under node_modules
# (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). tsx transforms them at runtime.
# cluster.fork() inherits execArgv, so every worker gets the loader too.
CMD ["node", "--import", "tsx", "src/init.ts"]
