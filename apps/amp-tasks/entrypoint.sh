#!/bin/bash
# InternalCloud entrypoint. Non-Rails services MUST source InternalCloud confs themselves — InternalCloud
# writes env-var confs to /conf/service_configurations.env at deploy time via a
# vault sidecar. Without this, secrets/config (DATABASE_URL, gateway creds,
# SecretStore keys) appear in `isc conf` but never reach the process.
set -a
ISC_CONF=/conf/service_configurations.env
if [ -f "$ISC_CONF" ]; then
  # shellcheck disable=SC1090
  source "$ISC_CONF"
fi
set +a

exec node server.js
