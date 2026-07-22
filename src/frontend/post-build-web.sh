#!/bin/bash
# Post-build script for Flutter Web
# Run after `flutter build web` to:
# 1. Enable local CanvasKit (avoid gstatic.com CDN)
# 2. Cache-bust main.dart.js with versioned filename
# 3. Update flutter_bootstrap.js references

set -euo pipefail

BUILD_DIR="$(cd "$(dirname "$0")" && pwd)/build/web"
BOOTSTRAP_JS="$BUILD_DIR/flutter_bootstrap.js"

echo "=== Post-build web: $BUILD_DIR ==="

# --- Step 1: Enable local CanvasKit ---
if grep -q '"useLocalCanvasKit"' "$BOOTSTRAP_JS"; then
    echo "[1/3] useLocalCanvasKit already set — skipping"
else
    echo "[1/3] Adding useLocalCanvasKit: true to flutter_bootstrap.js"
    sed -i 's/"engineRevision":"[^"]*"/&,"useLocalCanvasKit":true/' "$BOOTSTRAP_JS"
    echo "       Done"
fi

# --- Step 2: Cache-bust main.dart.js ---
# Find the current version number
VERSION_FILE="$BUILD_DIR/.last_build_id"
if [ -f "$VERSION_FILE" ]; then
    BUILD_ID=$(cat "$VERSION_FILE" | tr -d '\n' | head -c 8)
else
    BUILD_ID=$(date +%s)
fi

# Compute version number from existing files
LATEST_V=0
for f in "$BUILD_DIR"/main.dart.v*.js; do
    if [ -f "$f" ]; then
        NUM=$(echo "$f" | grep -oP 'main\.dart\.v\K[0-9]+')
        if [ "$NUM" -gt "$LATEST_V" ]; then
            LATEST_V=$NUM
        fi
    fi
done
NEXT_V=$((LATEST_V + 1))

echo "[2/3] Versioning main.dart.js → main.dart.v${NEXT_V}.js"
cp "$BUILD_DIR/main.dart.js" "$BUILD_DIR/main.dart.v${NEXT_V}.js"

# Update flutter_bootstrap.js to reference new versioned JS
sed -i "s/\"mainJsPath\":\"main\.dart\.js\"/\"mainJsPath\":\"main.dart.v${NEXT_V}.js\"/" "$BOOTSTRAP_JS"

# Clean old versioned files (keep only latest 2)
echo "[2/3] Cleaning old versioned main.dart.js files (keeping latest 2)"
ls -1t "$BUILD_DIR"/main.dart.v*.js 2>/dev/null | tail -n +3 | while read -r old; do
    rm -v "$old"
done

echo "       Versioned: main.dart.v${NEXT_V}.js"
echo "       Bootstrap references: main.dart.v${NEXT_V}.js"

# --- Step 3: Verify ---
echo "[3/3] Verifying..."
grep -q 'useLocalCanvasKit' "$BOOTSTRAP_JS" && echo "       ✓ useLocalCanvasKit is set"
grep -q "main.dart.v${NEXT_V}.js" "$BOOTSTRAP_JS" && echo "       ✓ Versioned main.dart.js referenced"
echo "       Done"

echo "=== Post-build complete ==="