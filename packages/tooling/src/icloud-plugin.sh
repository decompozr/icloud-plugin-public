#!/bin/sh
set -eu
artifact_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec bun "$artifact_directory/icloud-plugin.js" "$@"
