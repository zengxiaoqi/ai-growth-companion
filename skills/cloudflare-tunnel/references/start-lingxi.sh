#!/bin/bash
# ============================================
# 灵犀伴学 - 外网代理启动脚本
# 用法: ~/start-lingxi.sh [start|stop|status|restart]
# ============================================

set -e

PROJECT_DIR="/home/zxq/ai-growth-companion/src/backend"
TUNNEL_NAME="lingxi"
DOMAIN="lingxi.chataifree.eu.org"
PORT=3001
LOG_DIR="/home/zxq/logs"
PID_DIR="/tmp/lingxi"
NODE="/home/zxq/.nvm/versions/node/v22.22.0/bin/node"
NVM_DIR="/home/zxq/.nvm"

mkdir -p "$LOG_DIR" "$PID_DIR"

export NVM_DIR
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# ── 工具函数 ──────────────────────────────────

find_port_pid() {
    # 找到监听指定端口的进程 PID
    ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K\d+' | head -1
}

write_pid() {
    echo "$1" > "$PID_DIR/${2}.pid"
}

check_pid() {
    [ -f "$PID_DIR/${1}.pid" ] && kill -0 $(cat "$PID_DIR/${1}.pid") 2>/dev/null
}

# ── 后端 ──────────────────────────────────────

start_backend() {
    # 先检查 PID 文件
    if check_pid "backend"; then
        echo "✅ 后端已在运行 (PID: $(cat $PID_DIR/backend.pid))"
        return 0
    fi

    # 再检查端口是否已被占用（可能是其他方式启动的）
    local existing_pid=$(find_port_pid)
    if [ -n "$existing_pid" ]; then
        echo "✅ 端口 $PORT 已被占用 (PID: $existing_pid)，复用现有进程"
        write_pid "$existing_pid" "backend"
        return 0
    fi

    echo "🚀 启动后端服务..."
    cd "$PROJECT_DIR"
    nohup "$NODE" dist/main.js > "$LOG_DIR/lingxi-backend.log" 2>&1 &
    local new_pid=$!
    write_pid "$new_pid" "backend"

    # 等待新进程就绪
    for i in $(seq 1 30); do
        sleep 1
        if kill -0 "$new_pid" 2>/dev/null && ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q "$new_pid"; then
            echo "   ✅ 后端就绪 (PID: $new_pid, 端口 $PORT)"
            return 0
        fi
        if ! kill -0 "$new_pid" 2>/dev/null; then
            echo "   ❌ 后端启动失败，查看日志: tail -f $LOG_DIR/lingxi-backend.log"
            rm -f "$PID_DIR/backend.pid"
            return 1
        fi
    done
    echo "   ❌ 后端启动超时"
    return 1
}

# ── 隧道 ──────────────────────────────────────

start_tunnel() {
    if check_pid "tunnel"; then
        echo "✅ 隧道已在运行 (PID: $(cat $PID_DIR/tunnel.pid))"
        return 0
    fi

    # 也检查是否有由 systemd 管理的进程
    local existing=$(pgrep -f "cloudflared tunnel run $TUNNEL_NAME" | head -1)
    if [ -n "$existing" ]; then
        echo "✅ 隧道已在运行 (PID: $existing)，复用现有进程"
        write_pid "$existing" "tunnel"
        return 0
    fi

    echo "🌐 启动 Cloudflare 隧道..."
    nohup cloudflared tunnel run "$TUNNEL_NAME" > "$LOG_DIR/lingxi-tunnel.log" 2>&1 &
    local new_pid=$!
    write_pid "$new_pid" "tunnel"

    # 等待隧道就绪
    for i in $(seq 1 20); do
        sleep 2
        if curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/auth/login" \
            -X POST -H 'Content-Type: application/json' \
            -d '{"phone":"13800000001","password":"password123"}' --max-time 10 2>/dev/null | grep -q "201"; then
            echo "   ✅ 隧道就绪: https://$DOMAIN"
            return 0
        fi
        if ! kill -0 "$new_pid" 2>/dev/null; then
            echo "   ❌ 隧道启动失败，查看日志: tail -f $LOG_DIR/lingxi-tunnel.log"
            rm -f "$PID_DIR/tunnel.pid"
            return 1
        fi
    done
    echo "   ⚠️ 隧道可能仍在连接中，稍后会自动就绪"
    return 0
}

# ── 停止 ──────────────────────────────────────

stop_service() {
    local name=$1
    local pid_file="$PID_DIR/${name}.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "🛑 停止 $name (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$pid_file"
    fi
}

# ── 状态 ──────────────────────────────────────

status() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🐾 灵犀伴学 - 服务状态"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # 后端：先检查 PID 文件，再检查端口
    if check_pid "backend"; then
        echo "🔹 后端服务: ✅ 运行中 (PID: $(cat $PID_DIR/backend.pid))"
    elif [ -n "$(find_port_pid)" ]; then
        echo "🔹 后端服务: ✅ 运行中 (端口 $PORT, PID: $(find_port_pid))"
        write_pid "$(find_port_pid)" "backend"
    else
        echo "🔹 后端服务: ❌ 未运行"
    fi

    # 隧道
    if check_pid "tunnel"; then
        echo "🔹 隧道代理: ✅ 运行中 (PID: $(cat $PID_DIR/tunnel.pid))"
    else
        local tunnel_pid=$(pgrep -f "cloudflared tunnel run $TUNNEL_NAME" | head -1)
        if [ -n "$tunnel_pid" ]; then
            echo "🔹 隧道代理: ✅ 运行中 (PID: $tunnel_pid)"
            write_pid "$tunnel_pid" "tunnel"
        else
            echo "🔹 隧道代理: ❌ 未运行"
        fi
    fi

    echo "🔹 外网地址: https://$DOMAIN"
    echo "🔹 后端端口: http://localhost:$PORT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── 入口 ──────────────────────────────────────

case "${1:-start}" in
    start)
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🐾 灵犀伴学 - 启动中..."
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        start_backend
        start_tunnel
        echo ""
        echo "✅ 启动完成！"
        echo "🔗 外网地址: https://$DOMAIN"
        echo "📋 日志目录: $LOG_DIR"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ;;
    stop)
        stop_service "backend"
        stop_service "tunnel"
        echo "✅ 所有服务已停止"
        ;;
    status)
        status
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    *)
        echo "用法: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac
