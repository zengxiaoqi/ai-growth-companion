#!/usr/bin/env bash
# ==============================================================================
# 灵犀伴学 — 一键打包「本地调试」APK
#
# 为什么要这个脚本：真机/模拟器里的 APK 默认直连生产域名；而手机上的 localhost
# 指的是手机自己，不是开发机。本脚本自动探测开发机的局域网 IP，通过
# --dart-define=API_BASE_URL 注入本地后端地址（lib/services/api_service.dart
# 已支持该 dart-define，优先级高于生产域名）。
#
# 产物：dist/apk/lingxi-<mode>-v<版本>-<时间戳>-<架构>.apk（该目录已被 gitignore）
# 用法：bash build-debug-apk.sh [--help]
# ==============================================================================
set -euo pipefail

log()  { printf '[INFO] %s\n' "$*"; }
ok()   { printf '[ OK ] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
die()  { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法: bash build-debug-apk.sh [选项]   (Windows 可直接双击 build-debug-apk.bat)

默认行为: 打 debug 包 -> 自动探测本机局域网 IP -> 注入 http://<IP>:3001/api
         -> 只打当前连接设备的 CPU 架构(体积小) -> 有 adb 设备则自动安装并启动

选项:
  --api URL        直接指定 API 地址，跳过一切探测，例如:
                    --api http://192.168.1.7:3001/api   真机连局域网后端
                    --api http://10.0.2.2:3001/api       Android 模拟器连宿主机
  --ip IP          手动指定开发机局域网 IP（多网卡/探测不准时用）
  --port N         本地后端端口（默认读 src/backend/.env 的 PORT，再默认 3001）
  --prod           不注入地址，APK 直连生产域名 https://lingxi.chataifree.eu.org/api
  --release        打 release 包（排查只在 release 出现的性能/混淆问题时用）
  --fat            打全架构包（默认只打设备对应架构，fat 约 200MB）
  --clean          构建前先 flutter clean（依赖/原生代码异常时用）
  --no-install     只产出 APK，不调用 adb install（默认检测到设备会自动安装）
  --no-launch      安装后不自动拉起 App
  --dry-run        只做环境检查与地址探测，打印将执行的命令，不真正构建
  -h, --help       显示本帮助

示例:
  bash build-debug-apk.sh                      # 最常用：真机同一 WiFi 下一键打包+安装
  bash build-debug-apk.sh --no-install         # 只想要 APK 文件
  bash build-debug-apk.sh --ip 192.168.31.2    # 多网卡时指定正确的那张
  bash build-debug-apk.sh --prod --release     # 对照用的正式包
  bash build-debug-apk.sh --dry-run            # 检查环境/地址是否正确

注意: 本地后端需先启动 (cd src/backend && npm run start:dev)，且手机与电脑在同一局域网。
EOF
}

# ── 参数 ────────────────────────────────────────────────────────────────
MODE="debug"
API_OVERRIDE=""
HOST_OVERRIDE=""
PORT_OVERRIDE=""
USE_PROD=0
DO_INSTALL=1
NO_LAUNCH=0
FAT=0
DO_CLEAN=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --api)         API_OVERRIDE="${2:-}"; [ -n "$API_OVERRIDE" ] || die "--api 需要一个 URL"; shift 2 ;;
    --ip)          HOST_OVERRIDE="${2:-}"; [ -n "$HOST_OVERRIDE" ] || die "--ip 需要一个 IP"; shift 2 ;;
    --port)        PORT_OVERRIDE="${2:-}"; shift 2 ;;
    --prod)        USE_PROD=1; shift ;;
    --release)     MODE="release"; shift ;;
    --fat)         FAT=1; shift ;;
    --clean)       DO_CLEAN=1; shift ;;
    --no-install)  DO_INSTALL=0; shift ;;
    --install|-i)  DO_INSTALL=1; shift ;;
    --no-launch)   NO_LAUNCH=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             die "未知参数: $1（用 --help 查看用法）" ;;
  esac
done

# ── 路径与版本 ──────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/src/frontend"
BACKEND_ENV="$ROOT/src/backend/.env"
APK_BUILD_DIR="$FRONTEND/build/app/outputs/flutter-apk"
OUT_DIR="$ROOT/dist/apk"
PACKAGE_ID="com.example.lingxi_companion"

[ -d "$FRONTEND" ] || die "找不到 Flutter 项目: $FRONTEND"
VERSION_LINE="$(grep -E '^version:' "$FRONTEND/pubspec.yaml" | head -1 | awk '{print $2}' | tr -d '\r')"
[ -n "$VERSION_LINE" ] || die "无法从 pubspec.yaml 读取 version"
VERSION_NAME="${VERSION_LINE%%+*}"
VERSION_CODE="${VERSION_LINE##*+}"

# ── 环境检查 ────────────────────────────────────────────────────────────
command -v flutter >/dev/null 2>&1 || die "未找到 flutter，请先安装 Flutter SDK 并加入 PATH"
command -v java    >/dev/null 2>&1 || die "未找到 java，请安装 JDK 17+（CI 用的是 17）"
if ! command -v adb >/dev/null 2>&1; then
  warn "未找到 adb，将跳过自动安装（APK 仍会正常产出）"
fi

# ── 设备 / ABI ──────────────────────────────────────────────────────────
DEVICE_ID=""
IS_EMULATOR=0
if command -v adb >/dev/null 2>&1; then
  DEVICE_ID="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}' || true)"
fi
[[ "$DEVICE_ID" == emulator-* ]] && IS_EMULATOR=1

TARGET_PLATFORM="android-arm64"
ABI_TAG="arm64"
DEVICE_ABI=""
if [ -n "$DEVICE_ID" ] && [ "$IS_EMULATOR" -eq 0 ]; then
  DEVICE_ABI="$(adb -s "$DEVICE_ID" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r\n' || true)"
  case "$DEVICE_ABI" in
    arm64-v8a)          TARGET_PLATFORM="android-arm64"; ABI_TAG="arm64" ;;
    armeabi-v7a|armeabi) TARGET_PLATFORM="android-arm";   ABI_TAG="arm"   ;;
    x86_64)             TARGET_PLATFORM="android-x64";    ABI_TAG="x64"   ;;
    x86)                TARGET_PLATFORM="android-x86";    ABI_TAG="x86"   ;;
    *)  warn "未知设备 ABI(${DEVICE_ABI:-空})，回退 android-arm64" ;;
  esac
fi
if [ "$FAT" -eq 1 ]; then ABI_TAG="fat"; fi

# ── 后端端口 ────────────────────────────────────────────────────────────
PORT="$PORT_OVERRIDE"
if [ -z "$PORT" ] && [ -f "$BACKEND_ENV" ]; then
  PORT="$(sed -n 's/^PORT=//p' "$BACKEND_ENV" | head -1 | tr -d '\r"[:space:]' || true)"
fi
PORT="${PORT:-3001}"

# ── 探测局域网 IP ───────────────────────────────────────────────────────
# 优先用 Node 的 os.networkInterfaces()：跨平台、能拿到网卡名以排除虚拟网卡。
# 有 WiFi adb 设备时，用设备 IP 的 /24 网段给候选地址加权（选同一张网卡）。
HOST_IP=""
API_URL=""
LAN_IPS=""
if [ "$USE_PROD" -eq 1 ]; then
  log "已指定 --prod：不注入地址，APK 直连生产域名"
elif [ -n "$API_OVERRIDE" ]; then
  API_URL="$API_OVERRIDE"
  log "使用手动指定的 API 地址"
else
  if [ "$IS_EMULATOR" -eq 1 ]; then
    HOST_IP="10.0.2.2"
    log "检测到 Android 模拟器，宿主机地址使用 10.0.2.2"
  elif [ -n "$HOST_OVERRIDE" ]; then
    HOST_IP="$HOST_OVERRIDE"
  else
    DEV_HOST="${DEVICE_ID%%:*}"
    export LAN_HINT=""
    if [[ "$DEV_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      LAN_HINT="${DEV_HOST%.*}"
    fi
    if command -v node >/dev/null 2>&1; then
      LAN_IPS="$(node - <<'NODE' 2>/dev/null
const os = require('os');
const hint = process.env.LAN_HINT || '';
const skip = /virtual|vmware|vbox|wsl|docker|hyper-v|loopback|teredo|isatap|tap|tun|bluetooth|zerotier|tailscale/i;
const found = [];
for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
  if (skip.test(name)) continue;
  for (const a of addrs || []) {
    if (a.internal || (a.family !== 'IPv4' && a.family !== 4)) continue;
    const ip = a.address;
    if (!/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip)) continue;
    if (ip.startsWith('169.254.')) continue;
    found.push(ip);
  }
}
const score = ip => (hint && ip.substring(0, ip.lastIndexOf('.')) === hint ? 100 : 0)
  + (ip.startsWith('192.168.') ? 10 : ip.startsWith('10.') ? 5 : 0);
console.log([...new Set(found)].sort((a, b) => score(b) - score(a)).join('\n'));
NODE
)" || LAN_IPS=""
    fi
    # 降级：无 Node 时用 ipconfig(Windows) / hostname -I(Linux)
    if [ -z "$LAN_IPS" ] && command -v ipconfig >/dev/null 2>&1; then
      LAN_IPS="$(ipconfig 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' \
        | grep -vE '^(127\.|169\.254\.|255\.|0\.0\.0\.0)' | sort -u || true)"
      [ -z "$LAN_IPS" ] || warn "Node 不可用，改用 ipconfig 粗筛，请核对选中的 IP 是否正确"
    fi
    if [ -z "$LAN_IPS" ] && command -v hostname >/dev/null 2>&1; then
      LAN_IPS="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192\.168\.|10\.|172\.)' || true)"
    fi
    HOST_IP="$(printf '%s\n' "$LAN_IPS" | head -1)"
    if [ -z "$HOST_IP" ]; then
      die "没能探测到本机局域网 IP。请用 --ip <本机IP> / --api <完整URL> 指定，或用 --prod 连生产"
    fi
    log "候选局域网 IP: $(printf '%s\n' "$LAN_IPS" | tr '\n' ' ')  -> 选中 $HOST_IP"
  fi
  [ -n "$API_URL" ] || API_URL="http://${HOST_IP}:${PORT}/api"
fi

# ── 后端可达性（只提醒，不阻断构建） ────────────────────────────────────
if [ -n "$API_URL" ] && [[ "$API_URL" == http://* ]]; then
  PROBE_HOST="${HOST_IP:-$(printf '%s' "$API_URL" | sed -E 's#^http://([^:/]+).*#\1#')}"
  if [ "$PROBE_HOST" = "10.0.2.2" ]; then
    log "跳过可达性探测：10.0.2.2 只在 Android 模拟器内指向宿主机，从电脑侧连不通"
  elif command -v curl >/dev/null 2>&1; then
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://${PROBE_HOST}:${PORT}/" 2>/dev/null || echo 000)"
    if [ "$CODE" = "000" ]; then
      warn "本地后端 http://${PROBE_HOST}:${PORT} 连不上，APK 装上也登不了！"
      warn "先启动: cd src/backend && npm run start:dev  （并确认 Windows 防火墙放行 ${PORT} 端口）"
    else
      ok "本地后端可达 (HTTP $CODE)"
    fi
  fi
fi

# 单架构包只含当前设备的 so，装到别的 CPU 架构上会失败，提前说明
if [ "$FAT" -eq 0 ] && [ "$ABI_TAG" != "arm64" ] && [ -n "$DEVICE_ID" ]; then
  warn "当前设备 ABI 为 ${DEVICE_ABI}，此 APK 只含 ${TARGET_PLATFORM} 原生库，装到 arm 真机会失败"
  warn "要给其他架构的设备用，请加 --fat；或先断开该设备（断开后默认 android-arm64）"
fi

# ── 配置摘要 ────────────────────────────────────────────────────────────
log "──────────────── 构建配置 ────────────────"
log "版本      : v${VERSION_NAME}+${VERSION_CODE}"
log "构建模式  : ${MODE}"
log "API 地址  : ${API_URL:-生产域名（未注入）}"
log "目标架构  : $([ "$FAT" -eq 1 ] && echo '全架构 fat' || echo "${TARGET_PLATFORM}${DEVICE_ABI:+ (设备 ABI: $DEVICE_ABI)}")"
log "连接设备  : ${DEVICE_ID:-无}${DEVICE_ID:+  (构建后自动安装: $([ "$DO_INSTALL" -eq 1 ] && echo 是 || echo 否))}"
log "──────────────────────────────────────────"

# ── 构建 ────────────────────────────────────────────────────────────────
BUILD_ARGS=(build apk "--${MODE}")
[ -z "$API_URL" ] || BUILD_ARGS+=("--dart-define=API_BASE_URL=${API_URL}")
[ "$FAT" -eq 1 ]  || BUILD_ARGS+=("--target-platform=${TARGET_PLATFORM}")

if [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] 将执行:"
  printf '  cd %s && flutter pub get\n' "$FRONTEND"
  [ "$DO_CLEAN" -eq 1 ] && printf '  flutter clean\n'
  printf '  flutter'
  printf ' %q' "${BUILD_ARGS[@]}"
  printf '\n'
  log "[dry-run] 产物将复制到: ${OUT_DIR}/lingxi-${MODE}-v${VERSION_NAME}-${VERSION_CODE}-<时间戳>-${ABI_TAG}.apk"
  exit 0
fi

cd "$FRONTEND"
[ "$DO_CLEAN" -eq 1 ] && { log "flutter clean ..."; flutter clean; }
log "flutter pub get ..."
flutter pub get
log "开始构建（首次或 clean 后可能要几分钟）..."
flutter "${BUILD_ARGS[@]}"
ok "Flutter 构建完成"

# ── 收集产物 ────────────────────────────────────────────────────────────
SRC_APK="$APK_BUILD_DIR/app-${MODE}.apk"
if [ ! -f "$SRC_APK" ]; then
  SRC_APK="$(ls -t "$APK_BUILD_DIR"/*.apk 2>/dev/null | head -1 || true)"
fi
[ -n "$SRC_APK" ] && [ -f "$SRC_APK" ] || die "构建结束但找不到 APK，请检查上面的构建日志：$APK_BUILD_DIR"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_APK="$OUT_DIR/lingxi-${MODE}-v${VERSION_NAME}-${VERSION_CODE}-${STAMP}-${ABI_TAG}.apk"
cp "$SRC_APK" "$OUT_APK"
SIZE="$(du -h "$OUT_APK" | cut -f1)"
SHA="$(sha256sum "$OUT_APK" 2>/dev/null | cut -c1-16 || true)"
ok "APK 已生成: $OUT_APK (${SIZE}${SHA:+, sha256: ${SHA}...})"

{
  printf '产物      : %s\n' "$OUT_APK"
  printf '大小      : %s\n' "$SIZE"
  printf 'sha256    : %s\n' "${SHA:-N/A}"
  printf '版本      : v%s+%s\n' "$VERSION_NAME" "$VERSION_CODE"
  printf '构建模式  : %s\n' "$MODE"
  printf '目标架构  : %s\n' "$([ "$FAT" -eq 1 ] && echo fat || echo "$TARGET_PLATFORM")"
  printf 'API 地址  : %s\n' "${API_URL:-生产域名（未注入）}"
  printf '构建时间  : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
} > "$OUT_DIR/latest.txt"

# ── 安装并启动 ──────────────────────────────────────────────────────────
if [ "$DO_INSTALL" -eq 1 ] && [ -n "$DEVICE_ID" ]; then
  log "安装到设备 ${DEVICE_ID} ..."
  if adb -s "$DEVICE_ID" install -r "$OUT_APK"; then
    ok "安装完成"
    if [ "$NO_LAUNCH" -eq 0 ]; then
      adb -s "$DEVICE_ID" shell am start -n "${PACKAGE_ID}/.MainActivity" >/dev/null 2>&1 \
        && ok "已拉起 App" || warn "自动拉起失败，请手动打开 App"
    fi
  else
    warn "adb install 失败（APK 已生成，可手动安装或用 adb install -r）"
  fi
elif [ "$DO_INSTALL" -eq 1 ]; then
  warn "未检测到 adb 设备，跳过安装"
fi

log "──────────────── 完成 ────────────────"
log "APK      : $OUT_APK"
log "构建信息 : $OUT_DIR/latest.txt"
log "API      : ${API_URL:-生产域名}"
[ "$USE_PROD" -eq 0 ] && log "调试提示 : 电脑换网络后 IP 会变，需重新打包；或用 --api 固定地址"
log "耗时     : ${SECONDS}s"
