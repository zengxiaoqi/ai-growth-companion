// Generate AI commit message by calling the Anthropic-compatible API directly.
// Reads diff content from stdin, outputs a single commit subject line.
//
// Usage: printf '%s' "$diff" | node generate-commit-msg.js
//
// Environment variables:
//   ANTHROPIC_BASE_URL    - API base URL (default: https://api.anthropic.com)
//   ANTHROPIC_AUTH_TOKEN  - API key
//   ANTHROPIC_DEFAULT_SONNET_MODEL - Model name (default: claude-sonnet-4-20250514)

const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || '';
const model = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-sonnet-4-20250514';

let diffContent = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { diffContent += chunk; });
process.stdin.on('end', () => {
  if (!diffContent.trim()) {
    process.stderr.write('No diff content provided\n');
    process.exit(1);
  }

  const prompt = [
    '请根据以下 git diff 生成一个简洁专业的中文提交标题。',
    '只输出一行标题，不要解释，不要列表，不要前缀，不要分析过程。',
    '',
    '动词建议：新增、修复、优化、调整、重构、更新。',
    '',
    '例如：修复课程视频渲染队列重试逻辑',
    '',
    '直接输出标题，不要有任何其他文字：',
    '',
    'Git diff:',
    '',
    diffContent
  ].join('\n');

  fetch(baseUrl + '/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(30000)
  })
  .then(r => r.json())
  .then(d => {
    if (d.content && d.content[0] && d.content[0].text) {
      const text = d.content[0].text;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Collect candidate lines that look like commit subjects
      const candidates = [];
      for (const line of lines) {
        // Skip reasoning markers, analysis text, list items, markdown formatting
        if (line.startsWith('##')) continue;
        if (line.startsWith('-') || line.startsWith('*')) continue;
        if (line.startsWith('>')) continue;
        if (/^\d+\./.test(line)) continue;               // numbered list
        if (line.endsWith('：') || line.endsWith(':')) continue;  // trailing colon = reasoning
        if (line.includes('**')) continue;                 // bold markdown
        if (line.length > 50) continue;                    // too long
        if (!line.match(/[\u4e00-\u9fff]/)) continue;     // must have Chinese
        // Must start with a common commit verb
        if (/^(新增|修复|优化|调整|重构|更新|删除|移除|添加|修改|完善|改进)/.test(line)) {
          candidates.push(line);
        }
      }

      if (candidates.length > 0) {
        // Return the last candidate (most likely the final answer)
        process.stdout.write(candidates[candidates.length - 1]);
        return;
      }

      // Broader fallback: any Chinese line under 50 chars, no trailing colon
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.match(/[\u4e00-\u9fff]/) && line.length <= 50 &&
            !line.startsWith('-') && !line.startsWith('*') &&
            !line.endsWith('：') && !line.endsWith(':')) {
          process.stdout.write(line);
          return;
        }
      }

      // Last resort
      if (lines.length > 0) process.stdout.write(lines[0]);
    } else {
      process.exit(1);
    }
  })
  .catch(e => { process.stderr.write(e.message); process.exit(1); });
});
