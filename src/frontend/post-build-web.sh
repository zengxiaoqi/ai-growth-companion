#!/bin/bash
# Post-build script for Flutter Web — auto-fixes common issues
# Run after `flutter build web` to:
# 1. Enable local CanvasKit (avoid gstatic.com CDN)
# 2. Switch renderer to "html" (eliminate 7MB WASM download)
# 3. Cache-bust main.dart.js with versioned filename
# 4. Add .catch() error handling to load() call
# 5. Pre-compress .gz files for gzip_static
# 6. Copy updated index.html to build/web

set -euo pipefail

BUILD_DIR="$(cd "$(dirname "$0")" && pwd)/build/web"
BOOTSTRAP_JS="$BUILD_DIR/flutter_bootstrap.js"
BUILD_ID=$(date +%s | head -c 10)
NEXT_V=""

echo "=== Post-build web: $BUILD_DIR ==="
echo "Build ID: $BUILD_ID"

# --- Step 1: Enable local CanvasKit + switch to HTML renderer ---
echo ""
echo "[1] Applying flutter_bootstrap.js patches..."

# 1a: useLocalCanvasKit
if grep -q '"useLocalCanvasKit"' "$BOOTSTRAP_JS"; then
    echo "  [1a] useLocalCanvasKit already set — skipping"
else
    echo "  [1a] Adding useLocalCanvasKit: true"
    sed -i 's/"engineRevision":"[^"]*"/&,"useLocalCanvasKit":true/' "$BOOTSTRAP_JS"
fi

# 1b: renderer: canvaskit → html
if grep -qP '"renderer"\s*:\s*"canvaskit"' "$BOOTSTRAP_JS"; then
    echo "  [1b] Switching renderer: canvaskit → html"
    sed -i 's/"renderer":"canvaskit"/"renderer":"html"/g' "$BOOTSTRAP_JS"
else
    echo "  [1b] renderer already html — skipping"
fi

# --- Step 2: Cache-bust main.dart.js ---
echo ""
echo "[2] Versioning main.dart.js..."

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
echo "  Next version: v${NEXT_V}"

cp "$BUILD_DIR/main.dart.js" "$BUILD_DIR/main.dart.v${NEXT_V}.js"
echo "  Created: main.dart.v${NEXT_V}.js"

# Update bootstrap to reference versioned JS
sed -i "s/\"mainJsPath\":\"main\.dart\.js\"/\"mainJsPath\":\"main.dart.v${NEXT_V}.js\"/" "$BOOTSTRAP_JS"

# Clean old versioned files (keep latest 2)
ls -1t "$BUILD_DIR"/main.dart.v*.js 2>/dev/null | tail -n +3 | while read -r old; do
    rm -v "$old" 2>/dev/null || true
done

# --- Step 3: Add .catch() error handling to load() call ---
echo ""
echo "[3] Adding load() error handling..."
python3 -c "
import re
with open('$BOOTSTRAP_JS', 'r') as f:
    content = f.read()
# Replace the last line containing '});' with .catch() version
content = re.sub(
    r'\)\s*;\s*$',
    ').catch(function(err) { console.error(\"Flutter failed to load:\", err); var el = document.getElementById(\"loading-indicator\"); if (el) { el.textContent = \"加载失败，请刷新页面重试\"; el.style.color = \"red\"; } });',
    content
)
with open('$BOOTSTRAP_JS', 'w') as f:
    f.write(content)
print('  ✓ .catch() added')
"

# --- Step 4: Copy updated index.html to build/web ---
echo ""
echo "[4] Syncing index.html to build/web..."
cp "$(dirname "$0")/web/index.html" "$BUILD_DIR/index.html"
echo "  Copied: web/index.html → build/web/index.html"

# --- Step 5: Pre-compress gzip files ---
echo ""
echo "[5] Pre-compressing gzip files..."
for f in "$BUILD_DIR"/index.html "$BUILD_DIR"/flutter_bootstrap.js "$BUILD_DIR"/main.dart.v*.js; do
    if [ -f "$f" ]; then
        gzip -kf "$f" 2>/dev/null && echo "  ✓ gzipped $(basename "$f")"
    fi
done

# --- Step 6: Verify ---
echo ""
echo "[6] Verification..."
echo "  Bootstrap:"
grep -q 'useLocalCanvasKit' "$BOOTSTRAP_JS" && echo "    ✓ useLocalCanvasKit"
grep -qP '"renderer":"html"' "$BOOTSTRAP_JS" && echo "    ✓ renderer: html" || echo "    ✗ renderer NOT html!"
grep -q "main.dart.v${NEXT_V}.js" "$BOOTSTRAP_JS" && echo "    ✓ main.dart.v${NEXT_V}.js referenced"
echo "  Gzip files:"
for f in "$BUILD_DIR"/index.html.gz "$BUILD_DIR"/flutter_bootstrap.js.gz "$BUILD_DIR"/main.dart.v*.js.gz; do
    [ -f "$f" ] && echo "    ✓ $(basename "$f") ($(du -h "$f" | cut -f1))"
done

echo ""
echo "=== Post-build complete ==="
echo "Next step: cd build/web && sudo cp -r * /var/www/lingxi/"