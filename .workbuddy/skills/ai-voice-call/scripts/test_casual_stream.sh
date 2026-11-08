#!/usr/bin/env bash
# 冒烟测试 casual（碎碎念）模式 SSE 流
# 用法: bash test_casual_stream.sh [BASE_URL] [TOKEN]
#   BASE_URL 默认 http://localhost:3000/api
#   TOKEN    可选 JWT；未提供则跳过鉴权场景（后端若强制鉴权请传入）
#
# 验证点:
#   1. mode=casual 的流只包含 token/done 等事件，不含 tool 调用事件
#   2. 回复为口语短句（总长度 < 200 字符）

set -euo pipefail

BASE_URL="${1:-http://localhost:3000/api}"
TOKEN="${2:-}"
AUTH_HEADER=()
if [ -n "$TOKEN" ]; then
  AUTH_HEADER=(-H "Authorization: Bearer $TOKEN")
fi

TEXT="今天不想写作业"

echo "==> POST $BASE_URL/ai/chat  (mode=casual)"
RESPONSE=$(curl -sS --noproxy '*' -X POST "$BASE_URL/ai/chat" \
  -H "Content-Type: application/json" \
  "${AUTH_HEADER[@]}" \
  -d "{\"message\":\"$TEXT\",\"mode\":\"casual\"}")

echo "$RESPONSE" | head -c 500
echo

# 事件类型检查：不允许出现 tool 类事件
if echo "$RESPONSE" | grep -qi '"type"[^,]*tool'; then
  echo "❌ FAIL: casual 模式不应触发工具调用"
  exit 1
fi

# 回复长度检查
REPLY_LEN=$(echo "$RESPONSE" | wc -m)
echo "==> 回复字符数: $REPLY_LEN (应 < 200)"
if [ "$REPLY_LEN" -ge 200 ]; then
  echo "❌ FAIL: casual 回复过长，不是口语短句"
  exit 1
fi

echo "✅ PASS: casual 模式响应正常（无工具调用、短句回复）"
