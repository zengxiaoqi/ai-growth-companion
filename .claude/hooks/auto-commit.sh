#!/bin/bash
# Auto-commit when Claude finishes a task (Stop hook)
# Uses Claude CLI to generate a Chinese summary of the changes

cd "$CLAUDE_PROJECT_DIR"

# Check if there are any changes to commit
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "No changes to commit."
  exit 0
fi

# Stage all changed source files (skip logs, temp files, db)
git add 'src/**/*.ts' 'src/**/*.tsx' 'src/**/*.css' 'src/**/*.json' 2>/dev/null

# Check if anything was staged
if git diff --cached --quiet; then
  echo "No source code changes to commit."
  exit 0
fi

FILE_COUNT=$(git diff --cached --name-only | wc -l)

# Use claude CLI to generate a concise Chinese commit message from the diff
DIFF_CONTENT=$(git diff --cached --stat && echo "---" && git diff --cached -- 'src/**/*.ts' 'src/**/*.tsx' 'src/**/*.css' | head -200)

COMMIT_MSG=$(echo "$DIFF_CONTENT" | claude -p "请根据以下 git diff 内容，用中文生成一条简洁的 commit message（不超过50个字，不要加引号，只输出 commit message 本身）：" 2>/dev/null | tr -d '\r"')

# Fallback if claude CLI fails
if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="代码更新 (${FILE_COUNT}个文件)"
fi

git commit -m "$(cat <<EOF
${COMMIT_MSG}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)" --no-verify 2>/dev/null

if [ $? -eq 0 ]; then
  echo "Auto-commit successful: ${COMMIT_MSG}"
else
  echo "Auto-commit skipped."
fi

exit 0
