/**
 * 任意主题的 props 构建器：**走后端真实装配**，不是手写 props。
 *
 * 为什么需要它：
 *
 *   `render-storyboard-lesson.cjs` 只渲染《小熊玩滑梯》那一份，而且它的
 *   plan / world / habitat 都是脚本里自己注入的。也就是说，那个脚本**永远**
 *   看不到 `resolveLessonWorld()` 的真实判断——用它验证"改动是否对所有主题
 *   生效"，等于自己出题自己判卷。上一轮"整节课一处场地"就差点被这个假通过
 *   骗过去：脚本里 `world` 是硬算的，与后端给不给 world 无关。
 *
 * 这里直接调 `generateRemotionComposition()`（不含 LLM，纯确定性装配），
 * 把某个分镜 JSON 变成 props.json，再交给 remotion 渲染：
 *
 *   npx ts-node --transpile-only scripts/build-lesson-props.ts \
 *     --file test/fixtures/forest-storyboard.json \
 *     --out ../video-remotion/out/forest.props.json
 *
 * 输出的 props 里带 `world` / `setpiece` / `backgroundStyle` / `interaction.puppet`
 * 等**后端真正下发的字段**，所以渲染结果就是线上会给这个主题的画面。
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VideoGenerationAgentService } from '../src/modules/learning/video-generation-agent.service';
import { VisualAssetService } from '../src/modules/learning/visual-asset.service';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}

/** 与 video-generation-agent.service.spec.ts 同一套桩：只装配，不跑 agent 循环 */
function createService(): VideoGenerationAgentService {
  return new VideoGenerationAgentService(
    { getToolDefinitions: () => [] } as any,
    {} as any,
    { runLoop: async () => undefined } as any,
    { getSkillsForAgent: () => [] } as any,
    new VisualAssetService(),
  );
}

async function main() {
  const file = arg('file');
  const out = arg('out');
  if (!file || !out) throw new Error('用法：--file <storyboard.json> --out <props.json>');

  const storyboard = JSON.parse(await fs.readFile(path.resolve(process.cwd(), file), 'utf8'));
  const service = createService();
  const manifest = await service.generateRemotionComposition(storyboard as any, {});

  const props = manifest.props as any;
  const absOut = path.resolve(process.cwd(), out);
  await fs.mkdir(path.dirname(absOut), { recursive: true });
  await fs.writeFile(absOut, JSON.stringify(props), 'utf8');

  // 把"这一份分镜实际落到哪些分支、拿了哪份场地"打出来——答案是给人看的，
  // 不是给断言看的：跑一次就知道这个主题有没有被世界层覆盖。
  const worlds = new Set(props.scenes.map((s: any) => JSON.stringify(s.world)));
  console.log(`[props] ${props.scenes.length} 幕 ${props.durationFrames} 帧 → ${out}`);
  console.log(
    `[props] 分支：` +
      props.scenes
        .map((s: any, i: number) => {
          const it = s.interaction;
          const branch = !it
            ? s.sceneGraph
              ? 'graph'
              : 'plain'
            : it.action3d
              ? `3d:${it.action3d.motion}`
              : it.puppet
                ? `2d:${it.puppet.motion}`
                : `actor:${it.verb}`; // 没有 puppet/action3d 的互动幕 → ActionStage
          return `${i + 1}=${branch}`;
        })
        .join(', '),
  );
  console.log(`[props] 场地：${[...worlds].map((w) => JSON.parse(w as string)).map((w: any) => `${w.venue}${w.slide ? '+slide' : ''}`).join(' | ')}`);
  console.log(
    `[props] setpiece：` +
      props.scenes.map((s: any, i: number) => `${i + 1}=${s.setpiece || '-'}`).join(', '),
  );
}

main().catch((error) => {
  console.error('[props] 失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
