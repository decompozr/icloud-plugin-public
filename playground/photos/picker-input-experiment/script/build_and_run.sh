#!/bin/bash
set -euo pipefail
experiment_root="$(cd "$(dirname "$0")/.." && pwd)"
repository_root="$(git -C "$experiment_root" rev-parse --show-toplevel)"
output="$repository_root/.flow-runtime/native-sharing/picker-input-experiment"
app="$output/Photos Input Experiment.app"
mode="${1:---build-only}"
case "$mode" in
 --build-only) ;;
 --run) test "$#" -eq 3 || { echo 'Usage: build_and_run.sh --run PRIVATE_REQUEST PRIVATE_EVIDENCE_DIRECTORY' >&2; exit 2; } ;;
 *) echo 'Use --build-only or --run REQUEST EVIDENCE_DIRECTORY' >&2; exit 2 ;;
esac
mkdir -p "$output"
chmod 700 "$output"
if [[ "$mode" == --build-only ]]; then
 mkdir -p "$app/Contents/MacOS"
 cp "$experiment_root/Info.plist" "$app/Contents/Info.plist"
 swiftc -parse-as-library "$experiment_root/PickerExperiment.swift" -o "$app/Contents/MacOS/picker-input-experiment" -framework AppKit -framework Photos -framework PhotosUI -framework SwiftUI
 codesign --force --sign - "$app"
 codesign --verify --strict "$app"
 echo "$app"
else
 # Launch the already-verified bundle. No rebuild or forced process termination.
 test -f "$app/Contents/MacOS/picker-input-experiment"
 codesign --verify --strict "$app"
 /usr/bin/open -n "$app" --args --request "$2" --evidence "$3"
fi
