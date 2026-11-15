#!/usr/bin/env node
/**
 * probe-storyboard-budget.ts — 分镜能不能活着走出 LLM 客户端
 *
 * 为什么需要这条探针：分镜生成失败是**静默**的。generate() 返回空串时，
 * generate-video-content 会试满 3 次，然后 buildFallbackStoryboard —— 产出
 * 一份"通用卡片"分镜，figure / sceneGraph 一个都没有，但整条链路不报错。
 * 于是表现为"视频做出来了，但画面永远是卡片"，很难归因。
 *
 * 思考型模型（MiniMax-M3 这类）把一两万 token 花在 <think> 上，客户端默认
 * 的升级上限 16384 到不了正文，就是这个静默失败最常见的成因。
 * 这条探针走生产同一个 LlmClientService + 同一份 prompt，直接断言"正文里有没有 scenes"。
 *
 * 用法：npx ts-node -T scripts/probe-storyboard-budget.ts [--topic 彩虹是怎么形成的] [--budget 32768]
 * 退出码：0 = 拿到合法 JSON；1 = 空串/截断（此时看 LLM_STORYBOARD_MAX_TOKENS）
 */
import * as fs from 'fs';
import * as path from 'path';
import { LlmClientService } from '../src/agent-framework/llm/llm-client.service';
import { GenerateVideoContentTool } from '../src/agent-framework/tools/impl/generate-video-content';

const argv = process.argv.slice(2);
const argOf = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};

function readEnv(): Record<string, string> {
  const file = path.resolve(__dirname, '../.env');
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const env = { ...readEnv(), ...process.env } as Record<string, string>;
  const topic = argOf('topic', '彩虹是怎么形成的') as string;
  const budget = Number(argOf('budget', env.LLM_STORYBOARD_MAX_TOKENS || '32768'));

  const service = new LlmClientService({ get: (key: string, def?: unknown) => env[key] ?? def } as never);
  if (typeof (service as unknown as { onModuleInit?: () => Promise<void> }).onModuleInit === 'function') {
    await (service as unknown as { onModuleInit: () => Promise<void> }).onModuleInit();
  }

  const prompt = (GenerateVideoContentTool.prototype as unknown as {
    buildPrompt: (...args: unknown[]) => string;
  }).buildPrompt(topic, 'science', '5-6', 5);

  const startedAt = Date.now();
  const out = await service.generate(prompt, undefined, { maxTokens: budget, temperature: 0.7 });
  const ms = Date.now() - startedAt;

  const hasScenes = Array.isArray((() => {
    try {
      const start = out.indexOf('{');
      return JSON.parse(out.slice(start, out.lastIndexOf('}') + 1)).scenes;
    } catch {
      return null;
    }
  })());

  console.log(`topic=${topic} budget=${budget} latency_ms=${ms} chars=${out.length} has_scenes=${hasScenes}`);
  if (!hasScenes) {
    console.error('分镜没拿到：模型很可能把预算全花在 <think> 上了。调 LLM_STORYBOARD_MAX_TOKENS 或换模型。');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
