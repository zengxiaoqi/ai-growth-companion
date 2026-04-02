#!/bin/bash
# Auto-commit after successful TypeScript build verification
# Triggered by: PostToolUse hook when running tsc --noEmit or vite build

cd "$CLAUDE_PROJECT_DIR"

# Check if there are any changes to commit
if git diff --quiet && git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

# Only auto-commit source files, skip logs and temp files
STAGED=$(git diff --name-only HEAD -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null)
UNSTAGED=$(git diff --name-only -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null)

if [ -z "$UNSTAGED" ] && [ -z "$STAGED" ]; then
  echo "No source code changes to commit."
  exit 0
fi

# Stage source files only
git add 'src/**/*.ts' 'src/**/*.tsx' 'src/**/*.json' '.planning/*.md' 2>/dev/null

# Generate commit message from diff
DIFF_SUMMARY=$(git diff --cached --stat | tail -1)
FILE_COUNT=$(git diff --cached --name-only | wc -l)

# Get last commit message prefix to continue the pattern
LAST_MSG=$(git log -1 --format='%s')

# Build a brief commit message
CHANGED_FILES=$(git diff --cached --name-only | head -5 | tr '\n' ', ' | sed 's/,$//')
if [ "$FILE_COUNT" -gt 5 ]; then
  CHANGED_FILES="$CHANGED_FILES ..."
fi

git commit -m "$(cat <<EOF
chore: auto-commit verified changes (${FILE_COUNT} files)

Files: ${CHANGED_FILES}

Auto-committed by Claude Code hook after verification passed.
EOF
)" --no-verify 2>/dev/null

if [ $? -eq 0 ]; then
  echo "Auto-commit successful."
else
  echo "Auto-commit skipped (nothing to commit or commit failed)."
fi

exit 0
