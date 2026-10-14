#!/bin/sh
set -eu
artifact_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$artifact_directory/DecompozR Studio.app/Contents/Resources/bun" ]; then
  exec "$artifact_directory/DecompozR Studio.app/Contents/Resources/bun" --no-env-file --config=/dev/null "$artifact_directory/DecompozR Studio.app/Contents/Resources/payload/icloud-plugin.js" "$@"
fi
exec bun "$artifact_directory/icloud-plugin.js" "$@"
