/**
 * 探针 2：测网关 tool 消息截断阈值。尾部放唯一标记，问模型标记是什么。
 * 用法：npx ts-node -T scripts/probe-tool-limit.ts [model]
 */
import * as dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.LLM_BASE_URL!;
const KEY = process.env.LLM_API_KEY!;
const MODEL = process.argv[2] || process.env.LLM_AUTHOR_MODEL || 'deepseek-v4-flash';

async function probe(size: number) {
  const marker = `ENDMARK-${size}-ZQ7X`;
  const filler = '彩虹颜色教学场景数据。'.repeat(Math.ceil(size / 12));
  const content = JSON.stringify({ data: filler.slice(0, Math.max(0, size - 200)), marker });
  const body = {
    model: MODEL,
    max_tokens: 100,
    messages: [
      { role: 'system', content: '你是测试助手。' },
      { role: 'user', content: '读文件后回答：marker 字段的值是什么？只回答值。' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_p', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.json"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_p', content },
    ],
  };
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json();
  const text = String(json?.choices?.[0]?.message?.content || JSON.stringify(json).slice(0, 150));
  console.log(`size=${content.length} hit=${text.includes(marker)} answer=${text.slice(0, 80).replace(/\n/g, ' ')}`);
}

async function main() {
  console.log(`model=${MODEL}`);
  for (const size of [1000, 2000, 3000, 4000, 5000, 6000, 8000]) {
    await probe(size);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });