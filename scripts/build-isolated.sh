#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/.build-tmp"

echo "[build-isolated] Preparing isolated build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "[build-isolated] Copying project..."
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='.build-tmp' \
  "$PROJECT_ROOT/" "$BUILD_DIR/"

echo "[build-isolated] Isolating workspace..."
rm -f "$BUILD_DIR/pnpm-workspace.yaml"
rm -f "$BUILD_DIR/pnpm-lock.yaml"
rm -f "$BUILD_DIR/package-lock.json"
rm -f "$BUILD_DIR/yarn.lock"
rm -f "$BUILD_DIR/bun.lockb"

echo "[build-isolated] Installing dependencies..."
cd "$BUILD_DIR"
pnpm install --frozen-lockfile

echo "[build-isolated] Running build..."
pnpm run build

echo "[build-isolated] Copying dist back to project..."
rm -rf "$PROJECT_ROOT/dist"
cp -r "$BUILD_DIR/dist" "$PROJECT_ROOT/dist"

echo "[build-isolated] Cleaning up..."
rm -rf "$BUILD_DIR"

echo "[build-isolated] Done. Output: $PROJECT_ROOT/dist"
