#!/bin/bash
# Auto-commit when Claude finishes a task (Stop hook)
# Runs verification before committing and generates a Chinese commit message

set -u

export LANG=C.UTF-8
export LC_ALL=C.UTF-8

resolve_project_dir() {
  local raw_dir converted_dir drive_letter rest_path normalized_dir
  raw_dir="${CLAUDE_PROJECT_DIR:?}"

  if [ -d "$raw_dir" ]; then
    printf '%s\n' "$raw_dir"
    return
  fi

  if command -v cygpath >/dev/null 2>&1; then
    converted_dir=$(cygpath -u "$raw_dir" 2>/dev/null || true)
    if [ -n "$converted_dir" ] && [ -d "$converted_dir" ]; then
      printf '%s\n' "$converted_dir"
      return
    fi
  fi

  if printf '%s' "$raw_dir" | grep -Eq '^[A-Za-z]:[\\/]'; then
    drive_letter=$(printf '%s' "$raw_dir" | cut -c1 | tr 'A-Z' 'a-z')
    rest_path=$(printf '%s' "$raw_dir" | cut -c3- | sed 's#\\#/#g')
    normalized_dir="/mnt/${drive_letter}${rest_path}"

    if [ -d "$normalized_dir" ]; then
      printf '%s\n' "$normalized_dir"
      return
    fi

    normalized_dir="/${drive_letter}${rest_path}"
    if [ -d "$normalized_dir" ]; then
      printf '%s\n' "$normalized_dir"
      return
    fi
  fi

  printf '%s\n' "$raw_dir"
}

PROJECT_DIR=$(resolve_project_dir)
PROJECT_DIR_WIN=""

cd "$PROJECT_DIR" || exit 1

resolve_windows_project_dir() {
  local raw_dir windows_dir
  raw_dir="${CLAUDE_PROJECT_DIR:?}"

  if printf '%s' "$raw_dir" | grep -Eq '^[A-Za-z]:[\\/]'; then
    printf '%s\n' "$(printf '%s' "$raw_dir" | sed 's#/#\\#g')"
    return
  fi

  if command -v wslpath >/dev/null 2>&1; then
    windows_dir=$(wslpath -w "$PROJECT_DIR" 2>/dev/null || true)
    if [ -n "$windows_dir" ]; then
      printf '%s\n' "$windows_dir"
      return
    fi
  fi

  printf '%s\n' "$raw_dir"
}

PROJECT_DIR_WIN=$(resolve_windows_project_dir)

has_worktree_changes() {
  ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]
}

stage_changes() {
  git add -A -- . \
    ':(exclude)src/backend/logs/**' \
    ':(exclude)src/**/*.log' \
    ':(exclude)**/*.log' \
    ':(exclude)**/*.tsbuildinfo' \
    ':(exclude)**/*.db' \
    ':(exclude)**/*.sqlite' \
    ':(exclude)**/*.sqlite3' \
    ':(exclude)src/video-remotion/out/**' \
    ':(exclude)**/dist/**' \
    ':(exclude)**/node_modules/**' >/dev/null 2>&1 || true
}

sanitize_commit_line() {
  printf '%s' "$1" \
    | tr -d '\r"' \
    | sed 's/^[[:space:]-]*//' \
    | sed 's/[[:space:]]*$//' \
    | sed -n '1p'
}

fallback_message_from_paths() {
  local files
  files=$(git diff --cached --name-only)

  if printf '%s\n' "$files" | grep -q '^\.claude/hooks/'; then
    printf '%b\n' '\u66f4\u65b0 Claude \u81ea\u52a8\u5316\u63d0\u4ea4\u6d41\u7a0b'
    return
  fi

  if printf '%s\n' "$files" | grep -q '^\.claude/'; then
    printf '%b\n' '\u8c03\u6574 Claude \u914d\u7f6e\u4e0e\u8f85\u52a9\u811a\u672c'
    return
  fi

  if printf '%s\n' "$files" | grep -q '^src/frontend-web/' && printf '%s\n' "$files" | grep -q '^src/backend/'; then
    printf '%b\n' '\u540c\u6b65\u8c03\u6574\u524d\u540e\u7aef\u529f\u80fd\u903b\u8f91'
    return
  fi

  if printf '%s\n' "$files" | grep -q '^src/frontend-web/'; then
    printf '%b\n' '\u8c03\u6574\u524d\u7aef\u9875\u9762\u4e0e\u4ea4\u4e92\u903b\u8f91'
    return
  fi

  if printf '%s\n' "$files" | grep -q '^src/backend/'; then
    printf '%b\n' '\u8c03\u6574\u540e\u7aef\u63a5\u53e3\u4e0e\u4e1a\u52a1\u903b\u8f91'
    return
  fi

  if printf '%s\n' "$files" | grep -q '^src/content/'; then
    printf '%b\n' '\u66f4\u65b0\u8bfe\u7a0b\u5185\u5bb9\u4e0e\u914d\u7f6e\u6570\u636e'
    return
  fi

  if printf '%s\n' "$files" | grep -Eq '(^|/)(README|AGENTS)\.md$|\.md$'; then
    printf '%b\n' '\u66f4\u65b0\u9879\u76ee\u6587\u6863\u8bf4\u660e'
    return
  fi

  printf '%b\n' '\u8c03\u6574\u9879\u76ee\u4ee3\u7801\u4e0e\u914d\u7f6e'
}

generate_commit_message() {
  local diff_content prompt response subject prompt_file prompt_file_win

  diff_content=$(
    {
      git diff --cached --stat
      echo
      echo "Changed files:"
      git diff --cached --name-status
      echo
      echo "Patch excerpt:"
      git diff --cached -- . ':(exclude)**/*.lock' | head -300
    }
  )

  prompt=$(cat <<'EOF'
You are generating a git commit subject line.
Based on the staged git diff, write one professional, specific, concise commit title in Simplified Chinese.

Rules:
- Output only the commit subject line, with no explanation.
- Describe the actual change, not the number of files.
- Prefer a concrete module, feature, or behavior change when possible.
- If the diff is large, summarize the single most important change.
- Start with a verb when natural, such as: 新增, 修复, 优化, 调整, 重构, 更新.
- Keep it within 32 Chinese characters and under 50 total characters.
- Do not use quotes, bullets, prefixes, suffixes, or markdown.
- Good example: 修复课程视频渲染队列重试逻辑
EOF
)

  prompt_file=$(mktemp 2>/dev/null || true)
  if [ -z "$prompt_file" ]; then
    fallback_message_from_paths
    return
  fi

  cat > "$prompt_file" <<EOF
${prompt}

Use the following staged git diff details to generate the commit title:

${diff_content}
EOF

  if command -v node >/dev/null 2>&1 && command -v claude >/dev/null 2>&1; then
    response=$(claude -p "$(cat "$prompt_file")" 2>/dev/null || true)
  elif command -v powershell.exe >/dev/null 2>&1; then
    if command -v wslpath >/dev/null 2>&1; then
      prompt_file_win=$(wslpath -w "$prompt_file" 2>/dev/null || true)
    fi
    if [ -z "${prompt_file_win:-}" ]; then
      prompt_file_win="$prompt_file"
    fi
    response=$(powershell.exe -NoProfile -Command "& {
      \$prompt = Get-Content -Raw -LiteralPath '$prompt_file_win'
      claude -p \$prompt
    }" 2>/dev/null | tr -d '\r' || true)
  else
    response=""
  fi

  rm -f "$prompt_file"
  subject=$(sanitize_commit_line "$response")

  if [ -n "$subject" ]; then
    echo "$subject"
  else
    fallback_message_from_paths
  fi
}

run_verification() {
  local verify_script
  verify_script=".claude/hooks/verify-commit.sh"

  if [ ! -f "$verify_script" ]; then
    return 0
  fi

  if bash "$verify_script"; then
    return 0
  fi

  echo "Auto-commit skipped: verification failed."
  return 1
}

if ! has_worktree_changes; then
  echo "No changes to commit."
  exit 0
fi

stage_changes

if git diff --cached --quiet; then
  echo "No eligible changes to commit."
  exit 0
fi

if ! run_verification; then
  exit 0
fi

COMMIT_MSG=$(generate_commit_message)

git commit -m "$(cat <<EOF
${COMMIT_MSG}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "Auto-commit successful: ${COMMIT_MSG}"
else
  echo "Auto-commit skipped."
fi

exit 0
