#!/bin/bash
# Pre-commit verification: run TypeScript check before allowing commit
# Returns exit 0 to allow, exit 2 to block

cd "$CLAUDE_PROJECT_DIR"

# Check if frontend or backend TS files changed
FRONTEND_CHANGED=$(git diff --name-only -- 'src/frontend-web/src/**/*.ts' 'src/frontend-web/src/**/*.tsx' 2>/dev/null)
BACKEND_CHANGED=$(git diff --name-only -- 'src/backend/src/**/*.ts' 2>/dev/null)

HAS_ERRORS=0

if [ -n "$FRONTEND_CHANGED" ]; then
  echo "Verifying frontend TypeScript..."
  cd src/frontend-web
  npx tsc --noEmit 2>&1 | grep -v 'test' | grep -i 'error'
  if [ $? -eq 0 ]; then
    echo "Frontend TypeScript check FAILED"
    HAS_ERRORS=1
  else
    echo "Frontend TypeScript check passed"
  fi
  cd "$CLAUDE_PROJECT_DIR"
fi

if [ -n "$BACKEND_CHANGED" ]; then
  echo "Verifying backend TypeScript..."
  cd src/backend
  npx tsc --noEmit 2>&1 | grep -i 'error'
  if [ $? -eq 0 ]; then
    echo "Backend TypeScript check FAILED"
    HAS_ERRORS=1
  else
    echo "Backend TypeScript check passed"
  fi
  cd "$CLAUDE_PROJECT_DIR"
fi

if [ "$HAS_ERRORS" -eq 1 ]; then
  echo "BLOCKING: TypeScript errors found. Fix before committing."
  exit 2
fi

exit 0
