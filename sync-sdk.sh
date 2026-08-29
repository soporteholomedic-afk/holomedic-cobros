#!/usr/bin/env bash
set -euo pipefail

# Thin delegate wrapper. The Node engine (scripts/sync-sdk.mjs) resolves the
# repo root from its own location, walks the tree, applies the mirror plan and
# exits with honest codes. This wrapper only forwards argv via exec.

SDK_DIR="/mnt/instaladores/HOLOMEDICSDK"
if [ ! -d "$SDK_DIR" ]; then
  echo "[ERROR] SDK directory not found: $SDK_DIR"
  echo "Make sure //172.16.10.12/instaladores is mounted at /mnt/instaladores"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec node "$SCRIPT_DIR/scripts/sync-sdk.mjs" "$@"
