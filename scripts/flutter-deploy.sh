#!/bin/bash
#
# Flutter Web 自动部署脚本
# 用法: ./scripts/flutter-deploy.sh [--watch] [--no-build] [--dry-run]
#   --watch   : 监听文件变化，自动构建部署
#   --no-build: 仅部署已有构建（不重新构建）
#   --dry-run : 模拟运行，显示将要执行的操作
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLUTTER_DIR="$PROJECT_ROOT/src/frontend"
BACKEND_PUBLIC_DIR="$PROJECT_ROOT/src/backend/public"
FLUTTER_WEB_DIR="$FLUTTER_DIR/build/web"
LAST_DEPLOY_FILE="$PROJECT_ROOT/.lingxi/last-deploy-commit"

# 解析参数
WATCH_MODE=false
NO_BUILD=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --watch)
      WATCH_MODE=true
      shift
      ;;
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --no-deploy)
      NO_DEPLOY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: $0 [--watch] [--no-build] [--dry-run]"
      exit 1
      ;;
  esac
done

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 Flutter SDK
check_flutter() {
  log_info "检查 Flutter SDK..."
  if [ -x "$HOME/flutter/bin/flutter" ]; then
    FLUTTER="$HOME/flutter/bin/flutter"
  elif command -v flutter &> /dev/null; then
    FLUTTER="flutter"
  else
    log_error "Flutter SDK 未找到!"
    exit 1
  fi
  
  FLUTTER_VERSION=$($FLUTTER --version --no-color 2>/dev/null | head -1)
  log_success "Flutter: $FLUTTER_VERSION"
}

# 检查变更
check_changes() {
  log_info "检查 Flutter 代码变更..."
  cd "$PROJECT_ROOT"
  
  # 获取最后的部署 commit
  LAST_COMMIT=""
  if [ -f "$LAST_DEPLOY_FILE" ]; then
    LAST_COMMIT=$(cat "$LAST_DEPLOY_FILE")
  fi
  
  # 获取当前 commit
  CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  
  # 检查 Flutter 目录变更
  CHANGES=false
  if [ -n "$LAST_COMMIT" ] && [ "$LAST_COMMIT" != "$CURRENT_COMMIT" ]; then
    if git diff --name-only "$LAST_COMMIT" HEAD -- "$FLUTTER_DIR" 2>/dev/null | grep -q .; then
      CHANGES=true
      CHANGED_FILES=$(git diff --name-only "$LAST_COMMIT" HEAD -- "$FLUTTER_DIR" 2>/dev/null | wc -l)
      log_warn "发现 $CHANGED_FILES 个文件变更"
    fi
  elif [ ! -f "$LAST_DEPLOY_FILE" ]; then
    CHANGES=true
    log_warn "首次部署"
  fi
  
  echo "$CHANGES"
}

# 构建 Flutter Web
build_flutter() {
  log_info "构建 Flutter Web..."
  cd "$FLUTTER_DIR"
  
  if [ "$DRY_RUN" = true ]; then
    log_info "[DRY-RUN] flutter build web --release"
    return 0
  fi
  
  # 清理旧构建（可选，节省空间）
  if [ -d "$FLUTTER_WEB_DIR" ]; then
    OLD_SIZE=$(du -sh "$FLUTTER_WEB_DIR" 2>/dev/null | cut -f1)
    log_info "旧构建大小: $OLD_SIZE"
  fi
  
  # 执行构建
  export PATH="$HOME/flutter/bin:$PATH"
  export ANDROID_HOME="$HOME/android-sdk"
  export ANDROID_SDK_ROOT="$HOME/android-sdk"
  
  if flutter build web --release 2>&1; then
    NEW_SIZE=$(du -sh "$FLUTTER_WEB_DIR" 2>/dev/null | cut -f1)
    log_success "构建完成! 新构建大小: $NEW_SIZE"
  else
    log_error "Flutter 构建失败!"
    exit 1
  fi
}

# 部署到后端
deploy_to_backend() {
  log_info "部署到后端 public 目录..."
  
  if [ "$DRY_RUN" = true ]; then
    log_info "[DRY-RUN] rsync -av --delete $FLUTTER_WEB_DIR/ $BACKEND_PUBLIC_DIR/"
    return 0
  fi
  
  # 备份现有部署时间戳
  if [ -f "$BACKEND_PUBLIC_DIR/index.html" ]; then
    OLD_MD5=$(md5sum "$BACKEND_PUBLIC_DIR/index.html" 2>/dev/null | cut -d' ' -f1)
  fi
  
  # 使用 rsync 同步（删除 stale 文件）
  rsync -av --delete "$FLUTTER_WEB_DIR/" "$BACKEND_PUBLIC_DIR/"
  
  # 验证
  if [ -f "$BACKEND_PUBLIC_DIR/index.html" ]; then
    NEW_MD5=$(md5sum "$BACKEND_PUBLIC_DIR/index.html" 2>/dev/null | cut -d' ' -f1)
    if [ "$OLD_MD5" != "$NEW_MD5" ]; then
      log_success "部署完成!"
    else
      log_warn "文件未变化，跳过部署"
    fi
  else
    log_error "部署失败: index.html 不存在"
    exit 1
  fi
}

# 重启后端服务
restart_backend() {
  log_info "检查后端服务..."
  
  cd "$PROJECT_ROOT/src/backend"
  
  # 检查是否有后端进程运行
  if pgrep -f "node dist/main" > /dev/null; then
    log_info "后端服务运行中，重启以加载新静态文件..."
    
    if [ "$DRY_RUN" = true ]; then
      log_info "[DRY-RUN] pkill -f 'node dist/main'; cd src/backend && nohup node dist/main &"
      return 0
    fi
    
    pkill -f "node dist/main"
    sleep 2
    
    # 重新启动后端
    cd "$PROJECT_ROOT/src/backend"
    nohup node dist/main > /dev/null 2>&1 &
    
    sleep 3
    
    # 验证
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null | grep -q "200"; then
      log_success "后端服务已重启"
    else
      log_warn "后端服务可能未正常启动，请手动检查"
    fi
  else
    log_warn "后端服务未运行"
  fi
}

# 验证部署
verify_deployment() {
  log_info "验证部署..."
  
  # 检查本地
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log_success "本地验证通过 (HTTP $HTTP_CODE)"
  else
    log_warn "本地验证失败 (HTTP $HTTP_CODE)"
  fi
  
  # 检查线上（如果可访问）
  if curl -s --connect-timeout 5 -o /dev/null -w "%{http_code}" https://lingxi.chataifree.eu.org/ 2>/dev/null | grep -q "200\|301\|302"; then
    log_success "线上验证通过"
  else
    log_warn "线上验证跳过（可能网络问题）"
  fi
}

# 保存部署记录
save_deploy_record() {
  cd "$PROJECT_ROOT"
  CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  echo "$CURRENT_COMMIT" > "$LAST_DEPLOY_FILE"
  
  # 创建目录如果不存在
  mkdir -p "$(dirname "$LAST_DEPLOY_FILE")"
  
  log_info "已记录部署: $CURRENT_COMMIT"
}

# 监听模式
watch_mode() {
  log_info "监听模式: 监听 Flutter 代码变更，自动构建部署"
  log_info "按 Ctrl+C 退出"
  
  # 使用 entr 或 fswatch 监听变化
  if command -v fswatch &> /dev/null; then
    log_info "使用 fswatch 监听..."
    fswatch -o "$FLUTTER_DIR/lib" | while read -r; do
      log_info "检测到变更，5秒后开始构建..."
      sleep 5
      run_deploy
    done
  elif command -v entr &> /dev/null; then
    log_info "使用 entr 监听..."
    find "$FLUTTER_DIR/lib" -name "*.dart" | entr -r -s "./scripts/flutter-deploy.sh"
  else
    log_error "需要安装 fswatch 或 entr 来使用监听模式"
    log_info "macOS: brew install fswatch"
    log_info "Linux: sudo apt install fswatch"
    exit 1
  fi
}

# 主部署流程
run_deploy() {
  log_info "========================================"
  log_info "Flutter Web 自动部署"
  log_info "========================================"
  
  check_flutter
  
  # 检查是否有变更
  CHANGES=$(check_changes)
  if [ "$CHANGES" = "false" ]; then
    log_info "无 Flutter 代码变更，跳过构建"
    return 0
  fi
  
  # 构建
  if [ "$NO_BUILD" != true ]; then
    build_flutter
  else
    log_info "跳过构建（--no-build）"
  fi
  
  # 部署
  deploy_to_backend
  
  # 保存记录
  save_deploy_record
  
  # 验证
  verify_deployment
  
  log_success "部署流程完成!"
}

# 主入口
main() {
  if [ "$WATCH_MODE" = true ]; then
    watch_mode
  else
    run_deploy
  fi
}

main
