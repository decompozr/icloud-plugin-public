#!/bin/sh
set -eu
if [ "$#" -lt 1 ]; then
  echo 'Usage: runtime.sh /absolute/config.toml [--initialize]' >&2
  exit 64
fi
case "$1" in /*) ;; *) echo 'Configuration path must be absolute' >&2; exit 64;; esac
artifact_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$artifact_directory"
# No dependency installation, build, environment-file sourcing, or config reset.
exec bun ./apps/studio/dist/server/index.js --config "$@"
