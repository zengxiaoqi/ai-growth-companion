#!/bin/bash
# Post-build script for Flutter Web — auto-fixes common issues
# Run after `flutter build web` to:
# 1. Enable local CanvasKit (avoid gstatic.com CDN)
# 2. Cache-bust main.dart.js with versioned filename
# 3. Add .catch() error handling to load() call
# 4. Pre-compress .gz files for gzip_static
# 5. Copy updated index.html to build/web
#
# NOTE: Flutter 3.47+ removed the HTML renderer; `flutter build web`
# compiles canvaskit only. Do NOT rewrite renderer to "html" — the loader
# would skip CanvasKit and the canvaskit-only bundle hangs at boot.

set -euo pipefail

BUILD_DIR="$(cd "$(dirname "$0")" && pwd)/build/web"
BOOTSTRAP_JS="$BUILD_DIR/flutter_bootstrap.js"
BUILD_ID=$(date +%s | head -c 10)
NEXT_V=""

echo "=== Post-build web: $BUILD_DIR ==="
echo "Build ID: $BUILD_ID"

# --- Step 1: Enable local CanvasKit ---
echo ""
echo "[1] Applying flutter_bootstrap.js patches..."

# 1a: useLocalCanvasKit — load canvaskit.js/.wasm from local build/web
# instead of fonts.gstatic.com / www.gstatic.com CDN (blocked in China).
if grep -q '"useLocalCanvasKit"' "$BOOTSTRAP_JS"; then
    echo "  [1a] useLocalCanvasKit already set — skipping"
else
    echo "  [1a] Adding useLocalCanvasKit: true"
    sed -i 's/"engineRevision":"[^"]*"/&,"useLocalCanvasKit":true/' "$BOOTSTRAP_JS"
fi

# Renderer stays "canvaskit" (Flutter 3.47+ has no HTML renderer).
echo "  [1b] Renderer kept as canvaskit (local CanvasKit via useLocalCanvasKit)"

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
sed -i 's/"mainJsPath":"[^"]*"/"mainJsPath":"main.dart.v'"${NEXT_V}"'.js"/' "$BOOTSTRAP_JS"

# Clean old versioned files (keep latest 2)
ls -1t "$BUILD_DIR"/main.dart.v*.js 2>/dev/null | tail -n +3 | while read -r old; do
    rm -v "$old" 2>/dev/null || true
done

# --- Step 3: Add .catch() error handling to load() call ---
echo ""
echo "[3] Adding load() error handling..."
python3 -c "
import re, sys
path = sys.argv[1]  # pass as argv so MSYS converts /d/... to D:\... for Windows Python
with open(path, 'r') as f:
    content = f.read()
# Replace the last line containing '});' with .catch() version
content = re.sub(
    r'\)\s*;\s*$',
    ').catch(function(err) { console.error(\"Flutter failed to load:\", err); var el = document.getElementById(\"lingxi-loader\"); if (el) { el.querySelector(\"p\").textContent = \"\\u52a0\\u8f7d\\u5931\\u8d25\\uff0c\\u8bf7\\u5237\\u65b0\\u9875\\u9762\\u91cd\\u8bd5\"; el.querySelector(\"p\").style.color = \"red\"; } var errEl = document.getElementById(\"lingxi-error\"); if (errEl) { errEl.textContent = err.message || \"\\u672a\\u77e5\\u9519\\u8bef\"; errEl.classList.add(\"show\"); } });',
    content
)
with open(path, 'w') as f:
    f.write(content)
print('  ✓ .catch() added')
" "$BOOTSTRAP_JS"

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
grep -qP '"renderer":"canvaskit"' "$BOOTSTRAP_JS" && echo "    ✓ renderer: canvaskit" || echo "    ✗ renderer NOT canvaskit!"
grep -q "main.dart.v${NEXT_V}.js" "$BOOTSTRAP_JS" && echo "    ✓ main.dart.v${NEXT_V}.js referenced"
echo "  Gzip files:"
for f in "$BUILD_DIR"/index.html.gz "$BUILD_DIR"/flutter_bootstrap.js.gz "$BUILD_DIR"/main.dart.v*.js.gz; do
    [ -f "$f" ] && echo "    ✓ $(basename "$f") ($(du -h "$f" | cut -f1))"
done

echo ""
echo "=== Post-build complete ==="
echo "Next step: Files are served from build/web/ by nginx directly. No manual copy needed."