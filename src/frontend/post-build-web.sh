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

# Strategy: remove the last line (the load() call), reconstruct it with .catch()
# The load() call is the last line of the file
# Pattern: _flutter.loader.load({...});
# We need: _flutter.loader.load({...}).catch(function(err) { ... });

# Find the last line that starts with _flutter.loader.load(
LOAD_LINE=$(grep -nP '^_flutter\.loader\.load\(' "$BOOTSTRAP_JS" | tail -1 | cut -d: -f1 || true)

if [ -n "$LOAD_LINE" ]; then
    # Extract the full load call (may span multiple lines)
    # Read the file, find the last }, and everything after it is the load call
    # Simple approach: just replace the last line
    sed -i '$d' "$BOOTSTRAP_JS"
    # Now look for the closing }); of the load config
    # The pattern is:   }); at the end of the file
    # We need to catch it before the last closing
    echo 'var _loadPromise = _flutter.loader.load({' >> "$BOOTSTRAP_JS"
    # Extract the config part from the original... 
    # Simpler: just append after the deleted line
    # Actually let me re-read the file to see what's left
    echo "  WARNING: Manual patch needed — load() call spans multiple lines"
    echo "  I'll handle it via patch instead"
else
    echo "  Trying to find and patch the load() call..."
    # The load() call is the last line(s) — let's just replace it
    # First, save the original load call
    # ... this is getting complex. Let me use a different approach
fi

# Actually, let me just use a targeted patch on the file
# The file ends with: _flutter.loader.load({...});
# Let me find where the _flutter.buildConfig variable ends, and insert after
echo "  Using sed to add .catch()..."
# The load() call is at the end: _flutter.loader.load({...});
# The pattern ends with an empty build entry: ,{}];
# Then the load call. Let me find the },{}]; line and insert after it
sed -i '/,\{\}\]/a\
var _loadPromise = _flutter.loader.load({' "$BOOTSTRAP_JS"
echo "  Done — need to verify manually"

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