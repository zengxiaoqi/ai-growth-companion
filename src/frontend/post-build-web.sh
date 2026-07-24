#!/bin/bash
# Post-build script for Flutter Web
# Run after `flutter build web` to:
# 1. Enable local CanvasKit (avoid gstatic.com CDN)
# 2. Cache-bust main.dart.js with versioned filename
# 3. Update flutter_bootstrap.js references
# 4. Add visible loading indicator & error handling

set -euo pipefail

BUILD_DIR="$(cd "$(dirname "$0")" && pwd)/build/web"
BOOTSTRAP_JS="$BUILD_DIR/flutter_bootstrap.js"

echo "=== Post-build web: $BUILD_DIR ==="

# --- Step 1: Enable local CanvasKit ---
if grep -q '"useLocalCanvasKit"' "$BOOTSTRAP_JS"; then
    echo "[1/5] useLocalCanvasKit already set — skipping"
else
    echo "[1/5] Adding useLocalCanvasKit: true to flutter_bootstrap.js"
    sed -i 's/"engineRevision":"[^"]*"/&,"useLocalCanvasKit":true/' "$BOOTSTRAP_JS"
    echo "       Done"
fi

# --- Step 2: Cache-bust main.dart.js ---
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

echo "[2/5] Versioning main.dart.js → main.dart.v${NEXT_V}.js"
cp "$BUILD_DIR/main.dart.js" "$BUILD_DIR/main.dart.v${NEXT_V}.js"

# Update flutter_bootstrap.js to reference new versioned JS
sed -i "s/\"mainJsPath\":\"main\.dart\.js\"/\"mainJsPath\":\"main.dart.v${NEXT_V}.js\"/" "$BOOTSTRAP_JS"

# Clean old versioned files (keep only latest 2)
echo "[2/5] Cleaning old versioned main.dart.js files (keeping latest 2)"
ls -1t "$BUILD_DIR"/main.dart.v*.js 2>/dev/null | tail -n +3 | while read -r old; do
    rm -v "$old"
done
echo "       Versioned: main.dart.v${NEXT_V}.js"
echo "       Bootstrap references: main.dart.v${NEXT_V}.js"

# --- Step 3: Add error handling to the load() call ---
# The load() call is the last expression in bootstrap — wrap it with .catch()
echo "[3/5] Adding load() error handling to flutter_bootstrap.js"
# Replace the final `_flutter.loader.load({...});` to add .catch()
sed -i 's|_flutter\.loader\.load({|_flutter.loader.load({|' "$BOOTSTRAP_JS"
# Append .catch() after the closing of the load() call
# Find the pattern: }); at the end (the load() call's closing)
sed -i 's|_flutter\.loader\.load({|_flutter.loader.load({|' "$BOOTSTRAP_JS"
# Simpler approach: just append at the end
LOAD_CALL=$(grep -n '_flutter\.loader\.load' "$BOOTSTRAP_JS" | head -1 | cut -d: -f1 || true)
if [ -n "$LOAD_CALL" ]; then
    # Replace the whole load call line with a wrapped version
    # The original is: _flutter.loader.load({...})
    # We need to make it: _flutter.loader.load({...}).catch(err => { ... })
    sed -i 's|_flutter\.loader\.load({|_flutter.loader.load({|' "$BOOTSTRAP_JS"
    # Now add .catch() after the load call
    # The file ends with the load call and a semicolon
    sed -i '$d' "$BOOTSTRAP_JS"  # remove last line (the load call)
    echo '_flutter.loader.load({' >> "$BOOTSTRAP_JS"
    # Add config
    echo '  serviceWorkerSettings: {' >> "$BOOTSTRAP_JS"
    echo '    serviceWorkerVersion: "0"' >> "$BOOTSTRAP_JS"
    echo '  }' >> "$BOOTSTRAP_JS"
    echo '}).catch(function(err) {' >> "$BOOTSTRAP_JS"
    echo '  console.error("[Flutter] Load FAILED:", err);' >> "$BOOTSTRAP_JS"
    echo '  if (window._lingxiLoader) window._lingxiLoader.error("加载失败: " + (err.message || String(err)));' >> "$BOOTSTRAP_JS"
    echo '});' >> "$BOOTSTRAP_JS"
    echo "       Done"
else
    echo "       ⚠ WARNING: Could not find load() call in bootstrap"
fi

# --- Step 4: Rebuild gzip pre-compression ---
echo "[4/5] Rebuilding gzip pre-compression..."
for f in "$BUILD_DIR"/index.html "$BUILD_DIR"/flutter_bootstrap.js "$BUILD_DIR"/flutter_bootstrap.v*.js; do
    [ -f "$f" ] && gzip -kf "$f" 2>/dev/null && echo "       ✓ gzipped $(basename "$f")"
done
echo "       Done"

# --- Step 5: Verify ---
echo "[5/5] Verifying..."
grep -q 'useLocalCanvasKit' "$BOOTSTRAP_JS" && echo "       ✓ useLocalCanvasKit is set"
grep -q "main.dart.v${NEXT_V}.js" "$BOOTSTRAP_JS" && echo "       ✓ Versioned main.dart.js referenced"
grep -q '\.catch(' "$BOOTSTRAP_JS" && echo "       ✓ load() error handling added"
echo "       Done"

echo "=== Post-build complete ==="