# amp-tasks — hosted control-plane backend for InternalCloud (ECS).
# Follows the sanctioned InternalCloud container contract:
#   - a user named `app` MUST exist (InternalCloud runs containers as `app`; missing it =
#     silent crash with zero logs)
#   - default ENTRYPOINT starts the server on its own
#   - web service listens on port 3000 (InternalCloud nginx forwards here by default)
#   - runtime config arrives via /conf/service_configurations.env (sourced in
#     entrypoint.sh), NOT baked into the image
#
# NOTE: better-sqlite3 is a native addon → we need a toolchain at build time.
# The hosted tier will move state to managed Postgres (see ADR-0009); until then
# the container runs SQLite on its ephemeral local disk (staging/proof only).
FROM node:22-bookworm-slim

# Native-build toolchain for better-sqlite3 (node-gyp).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# InternalCloud-required app user.
RUN useradd -m -s /bin/bash app

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY --chown=app:app . .
RUN chmod +x entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER app
ENTRYPOINT ["./entrypoint.sh"]
