#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR=$(mktemp -d)

echo "[build-isolated] Build dir: $BUILD_DIR"

echo "[build-isolated] Copying project..."
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='out' \
  "$PROJECT_ROOT/" "$BUILD_DIR/"

echo "[build-isolated] Isolating workspace..."
rm -f "$BUILD_DIR/pnpm-workspace.yaml"
rm -f "$BUILD_DIR/package-lock.json"
rm -f "$BUILD_DIR/yarn.lock"
rm -f "$BUILD_DIR/bun.lockb"

echo "[build-isolated] Installing dependencies..."
cd "$BUILD_DIR"
pnpm install --frozen-lockfile

echo "[build-isolated] Running build..."
pnpm run build

echo "[build-isolated] Copying out/ back to project..."
rm -rf "$PROJECT_ROOT/out"
cp -r "$BUILD_DIR/out" "$PROJECT_ROOT/out"

echo "[build-isolated] Cleaning up..."
rm -rf "$BUILD_DIR"

echo "[build-isolated] Done. Output: $PROJECT_ROOT/out"
