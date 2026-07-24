#!/bin/bash
# ============================================
# 灵犀伴学 - 一键部署脚本
# 在项目根目录运行: ./deploy.sh [--clean] [--backend-only]
# ============================================
# 流程:
#   [前端] 1. 构建 Flutter Web (包含 post-build 处理)
#   [后端] 2. 构建后端 TypeScript (如果 dist 过期)
#   [前后] 3. 重启后端服务
#   [前后] 4. 重启 cloudflared tunnel
#   [前后] 5. 清除 Cloudflare CDN 缓存
#   [前后] 6. 验证线上状态
# ============================================

set -euo pipefail

# ── 颜色 ──────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; BLUE='\033[0;34m'
CYAN='\033[0;36m'; NC='\033[0m'

# ── 项目路径 ──────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/src/frontend"
BACKEND_DIR="$PROJECT_ROOT/src/backend"
BUILD_DIR="$FRONTEND_DIR/build/web"

# ── 配置 ──────────────────────────────────────
DOMAIN="lingxi.chataifree.eu.org"
BACKEND_PORT=3001
TEST_PHONE="13800000001"
TEST_PASSWORD="password123"
FLUTTER_BIN="$HOME/flutter/bin/flutter"
NODE_BIN="$HOME/.nvm/versions/node/v22.22.0/bin/node"
NPM_BIN="$HOME/.nvm/versions/node/v22.22.0/bin/npm"

# CF 缓存（来自 .bashrc）
source ~/.bashrc 2>/dev/null || true
CF_TOKEN="${CF_API_TOKEN:-}"
CF_ZONE="${CF_ZONE_ID:-}"

# ── 日志函数 ──────────────────────────────────
log()   { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
fail()  { echo -e "${RED}  ✗${NC} $1"; }
step()  { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
header(){ echo -e "\n${CYAN}═══════════════════════════════════════════════${NC}"; }
footer(){ echo -e "${CYAN}═══════════════════════════════════════════════${NC}\n"; }

# ── 参数解析 ──────────────────────────────────
DO_CLEAN=false
BACKEND_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --clean)  DO_CLEAN=true ;;
    --backend-only) BACKEND_ONLY=true ;;
    --help|-h)
      echo "用法: ./deploy.sh [--clean] [--backend-only]"
      echo "  --clean        构建前清理 Flutter 缓存"
      echo "  --backend-only 仅部署后端（不构建前端）"
      exit 0 ;;
  esac
done

# ── 1. 构建 Flutter Web ───────────────────────
build_frontend() {
  step "1/6 构建 Flutter Web"

  export PATH="$HOME/flutter/bin:$PATH"
  cd "$FRONTEND_DIR"

  if [ "$DO_CLEAN" = true ]; then
    log "🧹 清理 Flutter 构建缓存..."
    $FLUTTER_BIN clean
  fi

  log "🔨 构建 Flutter Web (release)..."
  if ! $FLUTTER_BIN build web --release 2>&1; then
    warn "网络构建失败，尝试离线模式..."
    $FLUTTER_BIN pub get --offline || true
    $FLUTTER_BIN build web --release --no-pub
  fi
  ok "Flutter 构建完成"

  log "🔧 执行 post-build 处理..."
  bash "$FRONTEND_DIR/post-build-web.sh"
  ok "Post-build 完成"

  # 验证本地构建产物
  if grep -q 'flutter_bootstrap\.js' "$BUILD_DIR/index.html"; then
    if grep -q '"mainJsPath"' "$BUILD_DIR/flutter_bootstrap.js"; then
      local MAIN_JS=$(grep -oP '"mainJsPath"\s*:\s*"main\.dart\.v[0-9]+\.js"' "$BUILD_DIR/flutter_bootstrap.js" | head -1)
      ok "本地构建产物: $MAIN_JS"
    else
      warn "flutter_bootstrap.js 未设置 versioned mainJsPath，检查 post-build"
    fi
  else
    warn "index.html 缺少 flutter_bootstrap.js 引用"
  fi
}

# ── 2. 构建后端 TypeScript ────────────────────
build_backend() {
  step "2/6 构建后端"

  cd "$BACKEND_DIR"

  local NEED_BUILD=false
  if [ ! -f "dist/main.js" ]; then
    NEED_BUILD=true
    log "dist/main.js 不存在，需要构建"
  else
    local SRC_NEWEST=$(find src -name "*.ts" -newer dist/main.js 2>/dev/null | head -1)
    if [ -n "$SRC_NEWEST" ]; then
      NEED_BUILD=true
      log "TypeScript 源码有更新，重新构建"
    fi
  fi

  if [ "$NEED_BUILD" = true ]; then
    log "🔨 构建后端..."
    $NPM_BIN run build 2>&1
    ok "后端构建完成"
  else
    ok "后端已是最新，跳过构建"
  fi
}

# ── 3. 重启后端服务 ───────────────────────────
restart_backend() {
  step "3/6 重启后端服务"

  if systemctl --user is-active lingxi-backend.service &>/dev/null; then
    log "🔄 重启后端服务..."
    systemctl --user restart lingxi-backend.service
    sleep 3

    # 等待就绪（后端启动约需 12 秒）
    for i in $(seq 1 20); do
      if curl -sf -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/" 2>/dev/null | grep -q "200"; then
        ok "后端服务已就绪 (端口 $BACKEND_PORT)"
        return 0
      fi
      sleep 1
    done
    warn "后端服务可能未正常启动，请检查: journalctl --user -u lingxi-backend.service"
  else
    log "🚀 启动后端服务..."
    systemctl --user start lingxi-backend.service
    sleep 5
    if curl -sf -o /dev/null "http://localhost:$BACKEND_PORT/" 2>/dev/null; then
      ok "后端服务已启动"
    else
      warn "后端启动异常，请手动检查"
    fi
  fi
}

# ── 4. 重启 Cloudflare Tunnel ─────────────────
restart_tunnel() {
  step "4/6 重启 Cloudflare Tunnel"

  if systemctl --user is-active lingxi-tunnel.service &>/dev/null; then
    log "🔄 重启 tunnel..."
    systemctl --user restart lingxi-tunnel.service
    sleep 5

    # 等待隧道注册
    for i in $(seq 1 12); do
      if curl -sf -o /dev/null -w "%{http_code}" "https://$DOMAIN/" 2>/dev/null | grep -q "200"; then
        ok "Tunnel 已就绪: https://$DOMAIN"
        return 0
      fi
      sleep 2
    done
    warn "Tunnel 可能仍在连接中，稍后会自动就绪"
  else
    log "🚀 启动 tunnel..."
    systemctl --user start lingxi-tunnel.service
    sleep 5
    if curl -sf -o /dev/null "https://$DOMAIN/" 2>/dev/null; then
      ok "Tunnel 已就绪"
    else
      warn "Tunnel 启动中，稍后验证"
    fi
  fi
}

# ── 5. 清除 Cloudflare CDN 缓存 ───────────────
purge_cache() {
  step "5/6 清除 Cloudflare CDN 缓存"

  if [ -z "$CF_TOKEN" ] || [ -z "$CF_ZONE" ]; then
    warn "CF_API_TOKEN 或 CF_ZONE_ID 未设置，跳过缓存清除"
    warn "请确认 ~/.bashrc 中已设置"
    return
  fi

  log "🧹 清除全站 CDN 缓存..."
  local RESPONSE=$(curl -sf -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/purge_cache" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"purge_everything":true}' 2>&1)

  if echo "$RESPONSE" | grep -q '"success":true'; then
    ok "CF 全站缓存已清除"
  else
    warn "CF 缓存清除失败: $(echo "$RESPONSE" | grep -o '"errors":[^]]*]' | head -1)"
  fi
}

# ── 6. 验证 ────────────────────────────────────
verify() {
  step "6/6 验证部署"

  local ALL_OK=true

  # 6a. 前端 index.html
  log "🔍 前端: index.html"
  local INDEX=$(curl -sf "https://$DOMAIN/" 2>/dev/null || echo "")
  if echo "$INDEX" | grep -q 'flutter_bootstrap\.js'; then
    ok "index.html 引用: flutter_bootstrap.js"
  else
    fail "index.html 缺少 flutter_bootstrap.js 引用"
    ALL_OK=false
  fi

  # 6b. bootstrap 内部 mainJsPath 引用 versioned main.dart
  log "🔍 前端: bootstrap mainJsPath"
  local BOOTSTRAP_CONTENT=$(curl -sf "https://$DOMAIN/flutter_bootstrap.js" 2>/dev/null || echo "")
  local MAIN_JS=$(echo "$BOOTSTRAP_CONTENT" | grep -oP '"mainJsPath"\s*:\s*"main\.dart\.v[0-9]+\.js"' | head -1)
  if [ -n "$MAIN_JS" ]; then
    ok "bootstrap 引用: $MAIN_JS"
  else
    # 也检查版本化 bootstrap 文件（从旧脚本遗留）
    local BOOTSTRAP_V=$(curl -sf "https://$DOMAIN/" 2>/dev/null | grep -oP 'flutter_bootstrap\.v[0-9]+\.js' | head -1)
    if [ -n "$BOOTSTRAP_V" ]; then
      local V_CONTENT=$(curl -sf "https://$DOMAIN/$BOOTSTRAP_V" 2>/dev/null || echo "")
      local V_MAIN=$(echo "$V_CONTENT" | grep -oP 'main\.dart\.v[0-9]+\.js' | head -1)
      if [ -n "$V_MAIN" ]; then
        ok "bootstrap.v 引用: $V_MAIN"
      else
        fail "版本化 bootstrap 也未引用 versioned main.dart.js"
        ALL_OK=false
      fi
    else
      fail "bootstrap 未引用 versioned main.dart.js"
      ALL_OK=false
    fi
  fi

  # 6c. 前端 HTTP 状态
  log "🔍 前端: HTTP 状态"
  local FE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/" 2>/dev/null || echo "000")
  if [ "$FE_CODE" = "200" ]; then
    ok "前端: $FE_CODE"
  else
    fail "前端: $FE_CODE"
    ALL_OK=false
  fi

  # 6d. 后端 API 登录
  log "🔍 后端: API 登录"
  local LOGIN_RESULT=$(curl -sf -X POST "http://localhost:$BACKEND_PORT/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$TEST_PHONE\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null || echo "")
  local TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"//;s/"//')
  if [ -n "$TOKEN" ]; then
    ok "后端登录成功（token 已获取）"
  else
    fail "后端登录失败"
    ALL_OK=false
  fi

  # 6e. 后端 API 内容列表
  if [ -n "$TOKEN" ]; then
    log "🔍 后端: API 内容列表"
    local BE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "http://localhost:$BACKEND_PORT/api/contents" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")
    if [ "$BE_CODE" = "200" ] || [ "$BE_CODE" = "201" ]; then
      ok "后端 API: $BE_CODE"
    else
      warn "后端 API: $BE_CODE（可能无需认证）"
    fi
  fi

  # 6f. 后端 HTTP 健康检查
  log "🔍 后端: 健康检查"
  local HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/" 2>/dev/null || echo "000")
  if [ "$HEALTH_CODE" = "200" ]; then
    ok "后端健康: $HEALTH_CODE"
  else
    fail "后端健康: $HEALTH_CODE"
    ALL_OK=false
  fi

  echo ""
  if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}  ✅ 全部验证通过！${NC}"
    echo -e "  🌐  https://$DOMAIN"
  else
    echo -e "${RED}  ⚠ 部分检查未通过，请手动排查${NC}"
  fi
}

# ── 主流程 ─────────────────────────────────────
main() {
  header
  echo -e "${CYAN}  灵犀伴学 - 一键部署${NC}"
  echo -e "  $(date '+%Y-%m-%d %H:%M:%S')"
  [ "$DO_CLEAN" = true ] && echo -e "  ${YELLOW}--clean 模式${NC}"
  [ "$BACKEND_ONLY" = true ] && echo -e "  ${YELLOW}--backend-only 模式${NC}"
  header

  if [ "$BACKEND_ONLY" = false ]; then
    build_frontend
  else
    step "1/6 跳过前端构建 (--backend-only)"
  fi

  build_backend
  restart_backend

  if [ "$BACKEND_ONLY" = false ]; then
    restart_tunnel
    purge_cache
  fi

  verify

  echo ""
  echo -e "${GREEN}┌──────────────────────────────────────────────┐${NC}"
  echo -e "${GREEN}│  ✅ 部署完成！                                 │${NC}"
  echo -e "${GREEN}│  🌐  https://$DOMAIN                          │${NC}"
  echo -e "${GREEN}│  📱  测试: 13800000001 / password123          │${NC}"
  echo -e "${GREEN}└──────────────────────────────────────────────┘${NC}"
  echo ""
  echo "如需强制重新构建:  ./deploy.sh --clean"
  echo "仅部署后端:          ./deploy.sh --backend-only"
}

main