/**
 * 探针 3：网关是否截断历史中 assistant tool_calls 的大参数。
 * task 15 实测：agent 重写文件时写出 244 字节 + "... [truncated 39100 chars]"，
 * 疑似照抄了网关截断后的自己上一轮 writeFile 参数。
 * 构造 ~40k 字符的 writeFile arguments（尾部唯一标记），问模型标记值。
 * 用法：npx ts-node -T scripts/probe-assistant-args.ts [model]
 */
import * as dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.LLM_BASE_URL!;
const KEY = process.env.LLM_API_KEY!;
const MODEL = process.argv[2] || process.env.LLM_AUTHOR_MODEL || 'deepseek-v4-flash';

async function probe(size: number) {
  const marker = `ENDMARK-${size}-QK42`;
  const tail = `// ${marker}\nexport const GeneratedLesson = () => null;\n`;
  const filler = '// 教学视频组件填充行，彩虹颜色场景。\n'.repeat(Math.ceil(size / 18));
  const code = ('import React from "react";\n' + filler).slice(0, size - tail.length) + tail;
  const args = JSON.stringify({ path: 'GeneratedLesson.tsx', content: code });
  const body = {
    model: MODEL,
    max_tokens: 100,
    messages: [
      { role: 'system', content: '你是测试助手。' },
      { role: 'user', content: '你刚才用 writeFile 写了 GeneratedLesson.tsx。文件最后一行注释里的 ENDMARK 标记值是什么？只回答标记值本身。' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_w', type: 'function', function: { name: 'writeFile', arguments: args } }],
      },
      { role: 'tool', tool_call_id: 'call_w', content: JSON.stringify({ ok: true, path: 'GeneratedLesson.tsx', bytes: args.length }) },
    ],
  };
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json();
  const text = String(json?.choices?.[0]?.message?.content || JSON.stringify(json).slice(0, 150));
  console.log(`argsChars=${args.length} hit=${text.includes(marker)} answer=${text.slice(0, 100).replace(/\n/g, ' ')}`);
}

async function main() {
  console.log(`model=${MODEL}`);
  for (const size of [2000, 3500, 8000, 20000, 40000]) {
    await probe(size);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });