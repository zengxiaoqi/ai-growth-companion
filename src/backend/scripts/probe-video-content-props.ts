/**
 * 探针：验证 generateVideoContent 的 sanitize 是否保留 props。
 *
 * 分镜工具的 prompt 说了"先声明、再引用"还不够——sanitizeScene 是白名单，
 * 漏一个字段就会把 LLM 写出的 props 整段抹掉，后面整条道具链路静默失效。
 * 直接调工具一分钟出结果，不用等十分钟的出片。
 *
 * 用法（src/backend 下）：npx ts-node -T scripts/probe-video-content-props.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { LlmClientService } from '../src/agent-framework/llm/llm-client.service';
import { GenerateVideoContentTool } from '../src/agent-framework/tools/impl/generate-video-content';

async function main() {
  const configStub = { get: (key: string, def?: any) => process.env[key] ?? def } as any;
  const llm = new LlmClientService(configStub);
  await (llm as any).onModuleInit();
  const tool = new GenerateVideoContentTool(llm);
  const t0 = Date.now();
  const result = await tool.execute(
    { topic: '小熊浇花', domain: 'language', ageGroup: '5-6', sceneCount: 6 } as any,
    {} as any,
  );
  console.log(`[probe] ${Date.now() - t0}ms success=${result.success}`);
  if (!result.success) {
    console.log('[probe] error=', JSON.stringify(result.error).slice(0, 400));
    return;
  }
  const scenes = (result.data as any).scenes || [];
  let declared = 0;
  for (const [i, s] of scenes.entries()) {
    const props = Array.isArray(s?.props) ? s.props : [];
    if (props.length) declared += 1;
    console.log(
      `${i + 1}. ${s?.title} | props=${JSON.stringify(props)} | perf=${JSON.stringify(
        (s?.performance?.actions || []).map((a: any) => a?.verb + (a?.propId ? ':' + a.propId : '')),
      )}`,
    );
  }
  console.log(`[probe] declared ${declared}/${scenes.length}`);
}

main().catch((error) => {
  console.error('[probe] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
