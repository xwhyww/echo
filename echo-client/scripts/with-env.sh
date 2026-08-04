#!/bin/sh
# Runs a command with .env loaded into the environment.
#
# Vite reads .env by itself, but only for VITE_* names and only for its own
# build — the Tauri CLI reads nothing. APPLE_DEVELOPMENT_TEAM has to reach
# `tauri ios *` through the environment or the Xcode project is generated
# without a signing team, so the ios:* scripts go through here.
#
# Usage: sh scripts/with-env.sh tauri ios build
set -e

# `set -a` exports every variable assigned while it is on, which is what turns
# the plain KEY=value lines of .env into environment entries.
set -a
[ -f .env ] && . ./.env
set +a

exec "$@"
