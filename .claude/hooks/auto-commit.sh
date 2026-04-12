#!/bin/bash
# Auto-commit when Claude finishes a task (Stop hook)
# Uses AI (via API) to generate smart commit messages from diff content

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

to_shell_path() {
  local raw_path converted_path drive_letter rest_path
  raw_path="$1"

  if [ -z "$raw_path" ]; then
    return 1
  fi

  if command -v wslpath >/dev/null 2>&1; then
    converted_path=$(wslpath "$raw_path" 2>/dev/null || true)
    if [ -n "$converted_path" ]; then
      printf '%s\n' "$converted_path"
      return 0
    fi
  fi

  if command -v cygpath >/dev/null 2>&1; then
    converted_path=$(cygpath -u "$raw_path" 2>/dev/null || true)
    if [ -n "$converted_path" ]; then
      printf '%s\n' "$converted_path"
      return 0
    fi
  fi

  if printf '%s' "$raw_path" | grep -Eq '^[A-Za-z]:[\\/]'; then
    drive_letter=$(printf '%s' "$raw_path" | cut -c1 | tr 'A-Z' 'a-z')
    rest_path=$(printf '%s' "$raw_path" | cut -c3- | sed 's#\\#/#g')
    printf '/mnt/%s%s\n' "$drive_letter" "$rest_path"
    return 0
  fi

  return 1
}

PROJECT_DIR=$(resolve_project_dir)

cd "$PROJECT_DIR" || exit 1

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
  local diff_content response subject

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

  # Use Node.js to call the Anthropic-compatible API directly.
  # Extracts the last non-empty line that looks like a commit subject from the response,
  # which handles models that include reasoning/thinking in their text output.
  response=$(node -e "
    const diffContent = $(printf '%s' "$diff_content" | node -e '
      let d="";
      process.stdin.on("data",c=>d+=c);
      process.stdin.on("end",()=>console.log(JSON.stringify(d)));
    ');

    const prompt = \`You are generating a git commit subject line.
Based on the staged git diff, write one professional, specific, concise commit title in Simplified Chinese.

Rules:
- Output only the commit subject line, with no explanation.
- Describe the actual change, not the number of files.
- Prefer a concrete module, feature, or behavior change when possible.
- If the diff is large, summarize the single most important change.
- Start with a verb when natural, such as: \u65b0\u589e, \u4fee\u590d, \u4f18\u5316, \u8c03\u6574, \u91cd\u6784, \u66f4\u65b0.
- Keep it within 32 Chinese characters and under 50 total characters.
- Do not use quotes, bullets, prefixes, suffixes, or markdown.
- Good example: \u4fee\u590d\u8bfe\u7a0b\u89c6\u9891\u6e32\u67d3\u961f\u5217\u91cd\u8bd5\u903b\u8f91

Staged git diff details:

\${diffContent}\`;

    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || '';
    const model = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-sonnet-4-20250514';

    fetch(baseUrl + '/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(30000)
    })
    .then(r => r.json())
    .then(d => {
      if (d.content && d.content[0] && d.content[0].text) {
        const text = d.content[0].text;
        // Extract the last non-empty line that looks like a commit subject:
        // - Contains Chinese characters
        // - Short enough (under 50 chars)
        // - Not a list item or bullet
        const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (line.match(/[\\u4e00-\\u9fff]/) && line.length <= 50 && !line.startsWith('-') && !line.startsWith('*')) {
            process.stdout.write(line);
            return;
          }
        }
        // Fallback: take the last line with Chinese chars
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].match(/[\\u4e00-\\u9fff]/)) {
            process.stdout.write(lines[i]);
            return;
          }
        }
        // Last resort: first non-empty line
        if (lines.length > 0) process.stdout.write(lines[0]);
      } else {
        process.exit(1);
      }
    })
    .catch(e => { process.stderr.write(e.message); process.exit(1); });
  " 2>/dev/null) || true

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
