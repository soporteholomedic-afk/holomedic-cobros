#!/usr/bin/env bash
set -euo pipefail

SDK_DIR="/mnt/instaladores/HOLOMEDICSDK"

if [ ! -d "$SDK_DIR" ]; then
  echo "[ERROR] SDK directory not found: $SDK_DIR"
  echo "Make sure //172.16.10.12/instaladores is mounted at /mnt/instaladores"
  exit 1
fi

echo "Syncing project to SDK..."

cd /home/sysadmin/DEV/holomedic-cobros

tar --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='*.zip' \
    --exclude='sdd' \
    --exclude='docs' \
    --exclude='.gga' \
    --exclude='.pr-*.md' \
    --exclude='tsconfig.tsbuildinfo' \
    --exclude='*.xlsx' \
    --exclude='sigla-cli' \
    -cf - . | tar -xf - -C "$SDK_DIR"

echo "[OK] SDK synced to $SDK_DIR"
