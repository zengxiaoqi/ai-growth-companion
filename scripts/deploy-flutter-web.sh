#!/bin/bash
# Deploy Flutter Web with Cloudflare CDN cache busting
# Usage: ./deploy-flutter-web.sh [project_root] [--clean]
#
# Flutter Web's main.dart.js has no content hash in filename.
# This script renames it with a version suffix and updates references
# to bypass Cloudflare CDN's immutable cache.
#
# --clean flag: Run `flutter clean` before building. Use this when
#   incremental build cache produces stale builds that miss code changes.
#   Symptoms: source committed, build timestamp newer, but main.dart.js
#   doesn't contain the new code. See references/debugging-techniques.md
#
# Architecture:
#   Cloudflare Tunnel → nginx:8080 → src/frontend/build/web/ (static files)
#                                    → /api/ proxy to backend:3001

set -euo pipefail

PROJECT_ROOT="${1:-$HOME/ai-growth-companion}"
SHIFT_ARGS=("${@:2}")
FRONTEND_DIR="$PROJECT_ROOT/src/frontend"

# Parse --clean flag
DO_CLEAN=false
for arg in "${SHIFT_ARGS[@]:-}"; do
    case "$arg" in
        --clean) DO_CLEAN=true ;;
    esac
done

# Ensure Flutter is in PATH
export PATH="$HOME/flutter/bin:$PATH"

cd "$FRONTEND_DIR"

# Clean if requested (or if build seems stale)
if [ "$DO_CLEAN" = true ]; then
    echo "🧹 Cleaning Flutter build cache..."
    flutter clean
fi

# Try normal build first; fall back to offline if network is unavailable
# Network failures (proxy down, TLS timeout, DNS issues) cause `flutter pub get`
# to fail, which blocks `flutter build web`. The --no-pub flag skips pub resolution.
echo "🔨 Building Flutter Web..."
if ! flutter build web --release 2>&1; then
    echo "⚠️  Network build failed, trying offline mode..."
    flutter pub get --offline || true
    flutter build web --release --no-pub
fi

# Generate version from timestamp
V=$(date +%Y%m%d%H%M)
echo "📦 Version: $V"

# Cache busting: rename main.dart.js to versioned filename
cp build/web/main.dart.js "build/web/main.dart.v${V}.js"

# Update flutter_bootstrap.js to reference new filename
sed -i "s/main\\.dart\\.js/main.dart.v${V}.js/g" build/web/flutter_bootstrap.js

# Add version query param to flutter_bootstrap.js in index.html
# Remove any existing ?v= param first, then add new one
sed -i "s|flutter_bootstrap.js?v=[0-9]*|flutter_bootstrap.js|g" build/web/index.html
sed -i "s|flutter_bootstrap.js|flutter_bootstrap.js?v=${V}|g" build/web/index.html

# Verify build contains expected code (Unicode escape check)
# Flutter Web (dart2js) escapes all non-ASCII as \uXXXX
# This catches stale incremental builds that look fresh but miss code changes
echo "🔍 Verifying build content..."
python3 << PYEOF
# Build the \uXXXX byte pattern that dart2js uses for Chinese text
checks = {
    '灵犀伴学': '灵犀伴学'.encode('unicode_escape'),
    '积分管理': '积分管理'.encode('unicode_escape'),
}
all_ok = True
with open('build/web/main.dart.v${V}.js', 'rb') as f:
    data = f.read()
for label, pattern in checks.items():
    count = data.count(pattern)
    status = '✅' if count > 0 else '❌ MISSING'
    print(f'  {label}: {count} occurrences {status}')
    if count == 0:
        all_ok = False
if not all_ok:
    print('⚠️  Build may be stale! Run with --clean flag: ./deploy-flutter-web.sh --clean')
    print('   See references/debugging-techniques.md for details')
PYEOF

# Sync to backend public directory (NestJS serves static files from here)
rsync -av --delete build/web/ ../backend/public/ 2>/dev/null || true

# Check if Cloudflare tunnel is healthy; restart if stale
if command -v systemctl &>/dev/null; then
    if ! curl -sf --max-time 5 https://lingxi.chataifree.eu.org/ >/dev/null 2>&1; then
        echo "🔄 Cloudflare tunnel appears stale, restarting..."
        systemctl --user restart lingxi-tunnel.service
        sleep 5
    fi
fi

# Purge Cloudflare CDN cache for the old flutter_bootstrap.js
# This ensures the unversioned URL doesn't serve stale cached content
if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ]; then
    echo "🧹 Purging Cloudflare CDN cache..."
    curl -sf -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"files\":[\"https://lingxi.chataifree.eu.org/flutter_bootstrap.js\"]}" \
        >/dev/null 2>&1 && echo "  ✅ Cache purged" || echo "  ⚠️ Cache purge failed (non-critical)"
else
    echo "⚠️  CF_API_TOKEN or CF_ZONE_ID not set, skipping cache purge"
    echo "   Set them in ~/.bashrc to enable automatic cache purge"
fi

echo "✅ Deployed version $V"
echo ""
echo "Verify with:"
echo "  curl -sI https://lingxi.chataifree.eu.org/flutter_bootstrap.js?v=${V} | grep cf-cache"
echo "  curl -sI https://lingxi.chataifree.eu.org/main.dart.v${V}.js | grep cf-cache"
echo ""
echo "Tip: If new features don't appear, rebuild with --clean:"
echo "  ./deploy-flutter-web.sh $PROJECT_ROOT --clean"
