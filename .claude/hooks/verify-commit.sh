#!/bin/bash
# Pre-commit verification: run TypeScript checks before allowing commit
# Returns exit 0 to allow, exit 2 to block

set -u

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

has_changed_files() {
  local pattern_output
  pattern_output=$(
    {
      git diff --cached --name-only -- "$@"
      git diff --name-only -- "$@"
    } 2>/dev/null | sort -u
  )

  [ -n "$pattern_output" ]
}

run_typescript_check() {
  local label="$1"
  local workdir="$2"
  local workdir_win

  workdir_win="${PROJECT_DIR_WIN}\\$(printf '%s' "$workdir" | sed 's#/#\\#g')"

  echo "Verifying ${label} TypeScript..."

  if command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
    (
      cd "$workdir" || exit 1
      npx tsc --noEmit
    )
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "& { Set-Location -LiteralPath '$workdir_win'; npx.cmd tsc --noEmit }"
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /d /c "cd /d \"$workdir_win\" && npx.cmd tsc --noEmit"
  else
    echo "TypeScript check skipped: neither node nor cmd.exe is available."
    return 1
  fi

  if [ $? -ne 0 ]; then
    echo "${label} TypeScript check FAILED"
    return 1
  fi

  echo "${label} TypeScript check passed"
  return 0
}

HAS_ERRORS=0

if has_changed_files 'src/frontend-web/src/**/*.ts' 'src/frontend-web/src/**/*.tsx'; then
  if ! run_typescript_check "frontend" "src/frontend-web"; then
    HAS_ERRORS=1
  fi
fi

if has_changed_files 'src/backend/src/**/*.ts'; then
  if ! run_typescript_check "backend" "src/backend"; then
    HAS_ERRORS=1
  fi
fi

if [ "$HAS_ERRORS" -eq 1 ]; then
  echo "BLOCKING: TypeScript errors found. Fix before committing."
  exit 2
fi

exit 0
