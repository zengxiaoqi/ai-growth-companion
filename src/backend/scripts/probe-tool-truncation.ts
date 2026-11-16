/**
 * 探针：网关是否截断长 tool 消息。
 * 构造 ~10k 字符的 props 式 JSON 作为 tool result 回喂，问最后一个场景的标题。
 * 用法：npx ts-node -T scripts/probe-tool-truncation.ts [model ...]
 */
import * as dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.LLM_BASE_URL!;
const KEY = process.env.LLM_API_KEY!;
const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [process.env.LLM_AUTHOR_MODEL || 'deepseek-v4-flash', process.env.LLM_MODEL || 'deepseek-v4.1-flash'];

function buildProps(): string {
  const scenes = Array.from({ length: 7 }, (_, i) => ({
    id: `scene-${i + 1}`,
    title: `场景${i + 1}标题-${['红', '橙', '黄', '绿', '青', '蓝', '紫罗兰终点'][i]}`,
    narration: `这是第${i + 1}个场景的旁白，小朋友你好，我们一起来看看彩虹的颜色吧，${'颜色'.repeat(20)}。`,
    durationFrames: 180 + i * 10,
    beats: [
      { sentenceIndex: 0, span: 1, focus: `焦点${i + 1}`, reveal: [`元素${i + 1}`], motion: 'focus-ring' },
      { sentenceIndex: 1, span: 1, focus: `焦点${i + 1}`, reveal: [], motion: 'spring-pop' },
    ],
    figure: {
      shapes: Array.from({ length: 6 }, (_, j) => ({
        kind: 'circle', cx: 200 + j * 100, cy: 300 + i * 20, r: 40 + j * 5, fill: '#FFD6A5', reveal: j / 6,
      })),
      labels: [{ text: `标签${i + 1}`, x: 800, y: 150 }],
    },
  }));
  return JSON.stringify({ ok: true, data: { path: 'props.json', content: JSON.stringify({ title: '彩虹', durationFrames: 1400, scenes }), size: 9996, exists: true } });
}

async function probe(model: string, toolResult: string) {
  const body = {
    model,
    max_tokens: 300,
    messages: [
      { role: 'system', content: '你是测试助手。用户会让你读文件然后回答问题。' },
      { role: 'user', content: '请用 readFile 读 props.json，然后告诉我：最后一个场景（第 7 个）的 title 字段是什么？只回答标题本身。' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_probe_1', type: 'function', function: { name: 'readFile', arguments: JSON.stringify({ path: 'props.json' }) } }],
      },
      { role: 'tool', tool_call_id: 'call_probe_1', content: toolResult },
    ],
    tools: [{ type: 'function', function: { name: 'readFile', description: '读文件', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }],
  };
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json();
  const msg = json?.choices?.[0]?.message;
  const text = msg?.content || (msg?.tool_calls ? `[tool_calls: ${JSON.stringify(msg.tool_calls).slice(0, 200)}]` : JSON.stringify(json).slice(0, 300));
  console.log(`model=${model} toolResultChars=${toolResult.length} status=${res.status} ${Date.now() - t0}ms`);
  console.log(`  answer: ${String(text).slice(0, 300)}`);
  console.log(`  hit=${String(text).includes('紫罗兰终点')}`);
}

async function main() {
  const props = buildProps();
  console.log(`synthetic tool result: ${props.length} chars`);
  for (const model of MODELS) {
    await probe(model, props);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });