/**
 * 探针：只看"撰写分镜的那一步"会不会声明道具。
 *
 * 为什么单独探这一步：出片链路太长（LLM 分镜 → TTS → 装配 → 渲染），
 * 一次十分钟。而"模型到底有没有写 props"只是第一个环节的事，单独跑一分钟
 * 就有答案——不然每次都要等一整片才知道是提示词没教、还是装配层丢了。
 *
 * 用法（src/backend 下）：npx ts-node -T scripts/probe-quick-video-prompt.ts 小熊浇花
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { LlmClientService } from '../src/agent-framework/llm/llm-client.service';
import { QuickVideoService } from '../src/modules/learning/quick-video.service';

async function main() {
  const topic = process.argv[2] || '小熊浇花';
  const configStub = { get: (key: string, def?: any) => process.env[key] ?? def } as any;
  const llm = new LlmClientService(configStub);
  await (llm as any).onModuleInit();

  const service = new QuickVideoService({} as any, llm, {} as any);
  const t0 = Date.now();
  const content = await service.generateLessonContent({ topic, ageGroup: '5-6', durationSec: 56 });
  console.log(`[probe] ${Date.now() - t0}ms`);

  const scenes = content?.visualStory?.scenes || [];
  console.log(`[probe] scenes=${scenes.length}`);
  let declared = 0;
  for (const [i, s] of scenes.entries()) {
    const props = Array.isArray(s?.props) ? s.props : [];
    if (props.length) declared += 1;
    console.log(
      `${i + 1}. ${s?.title || s?.scene || '?'} | props=${JSON.stringify(props)} | perf=${JSON.stringify(
        (s?.performance?.actions || []).map((a: any) => a?.verb + (a?.propId ? ':' + a.propId : '')),
      )}`,
    );
  }
  console.log(
    `[probe] 声明了道具的幕：${declared}/${scenes.length}${declared ? '' : '（提示词没教到位或模型忽略了）'}`,
  );
}

main().catch((error) => {
  console.error('[probe] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
