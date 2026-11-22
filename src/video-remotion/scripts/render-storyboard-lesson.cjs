/**
 * 真实分镜整片渲染（绕开 LLM 与任务队列的验收通道）。
 *
 * 为什么需要它：
 * 线上出片要先跑一遍 LLM 分镜代理，那个环节不稳定（qwen3.8-flash 实测会
 * 连续 300s 超时）。但"分镜 → 模板 → 出片"这一段是确定性的，出问题只在
 * 渲染层。这个脚本把 `test/fixtures/slide-storyboard.json`（从真实任务日志
 * 里原样抠出的《小熊玩滑梯》分镜）直接喂给后端模板，渲染出一整条 MP4：
 * 验的就是 SceneLayer 的分支选择与 Puppet2D/ThreeActionStage 的成片效果。
 *
 * 用法（src/video-remotion 下）：
 *   node scripts/render-storyboard-lesson.cjs            # 出整片
 *   node scripts/render-storyboard-lesson.cjs --still 40 # 只出第 40 帧
 * 产物：out/storyboard-5scenes.mp4 / out/storyboard-<frame>.png
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const remotionDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(remotionDir, '..', '..');
const servicePath = path.join(
  repoRoot,
  'src',
  'backend',
  'src',
  'modules',
  'learning',
  'video-generation-agent.service.ts',
);
const fixturePath = path.join(
  repoRoot,
  'src',
  'backend',
  'test',
  'fixtures',
  'slide-storyboard.json',
);
const templateListPath = path.join(
  repoRoot,
  'src',
  'backend',
  'src',
  'modules',
  'learning',
  'video',
  'stage-template.ts',
);

function readStageFiles() {
  const source = fs.readFileSync(templateListPath, 'utf8');
  const marker = source.indexOf('export const STAGE_TEMPLATE_FILES');
  const assign = source.indexOf('= [', marker);
  if (marker < 0 || assign < 0) throw new Error('STAGE_TEMPLATE_FILES not found');
  const end = source.lastIndexOf('];');
  return JSON.parse(source.slice(assign + 2, end + 1));
}

function extractLessonTemplate() {
  const source = fs.readFileSync(servicePath, 'utf8');
  const anchor = 'return String.raw`';
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error('buildGeneratedLessonTsx anchor not found');
  const bodyStart = start + anchor.length;
  const end = source.indexOf('`;', bodyStart);
  if (end < 0) throw new Error('template end not found');
  return source
    .slice(bodyStart, end)
    .replace(/\$\{JSON\.stringify\(VECTOR_ANIMAL_IDS\)\}/g, '[]')
    .replace(/\$\{JSON\.stringify\([A-Z_]+\)\}/g, '{}');
}

const RIG = { fur: '#a9744f', belly: '#f0d3b2', ears: 'round', tail: 'stub', scale: 1 };
const FPS = 30;

/**
 * 分支计划来自 **线上同一套推导**（src/backend/scripts/derive-storyboard-plan.ts），
 * 不在本脚本里用正则猜。曾经在这里猜过：把回顾幕"先爬楼梯，再滑滑梯，然后拍皮球"
 * 猜成 climb，整幕画成又在爬梯；而真实推导对它返回空（回顾幕不演单个动作）。
 * 猜与推看起来都"能出画面"，错的只有内容——所以推导只留一份。
 */
const planPath = path.join(
  repoRoot,
  'src',
  'backend',
  'test',
  'fixtures',
  'slide-storyboard.plan.json',
);
if (!fs.existsSync(planPath)) {
  console.error(
    'missing plan: run `npx ts-node scripts/derive-storyboard-plan.ts` in src/backend first',
  );
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const PROP_LABELS = { slide: '滑梯', ball: '皮球' };

/**
 * 分镜 → 渲染 props 的映射。
 *
 * 与线上 buildSceneData 的关键差异只有一处：线上由 resolveAction3D / resolvePuppet
 * 把"谁在什么道具上做什么"补齐成坐标，这里直接写下注册表里的默认值。
 * 数值保持同源（climb 的 -0.55→1.5 / steps 4 就是 PUPPET_DEFAULTS.climb），
 * 所以画面与线上一致；分镜本身不做任何美化，照抄 fixture。
 */
const storyboard = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const scenes = storyboard.scenes.map((s, i) => {
  const item = plan[i];
  if (!item) throw new Error('plan/scene length mismatch at ' + i);
  const durationFrames = s.durationSec * FPS;
  const propId = item.interaction && item.interaction.propId;
  return {
    id: `scene-${i + 1}`,
    title: s.title,
    narration: s.narration,
    onScreenText: s.onScreenText,
    visualDescription: s.visualDescription,
    assetKey: 'bear',
    assetTags: ['slide', 'ball'],
    // 指认幕要把被指的实物摆出来（SceneLayer 用同一个 propId 决定画哪个道具）
    props: propId ? [{ id: propId, label: PROP_LABELS[propId] || '' }] : [],
    ...(item.interaction
      ? {
          interaction: {
            ...item.interaction,
            ...(item.interaction.action3d
              ? { action3d: { ...item.interaction.action3d, rig: RIG } }
              : { puppet: { ...item.interaction.puppet, rig: RIG } }),
          },
        }
      : {}),
    ...(s.sceneGraph ? { sceneGraph: s.sceneGraph } : {}),
    action: 'idle',
    habitat: 'grassland',
    backgroundStyle: 'environment',
    generatedVisual: 'bear-grassland',
    template: s.animationTemplate ? s.animationTemplate.id : 'language.story-scene',
    durationFrames,
    accentColor: (storyboard.visualTheme && storyboard.visualTheme.accentColor) || '#4d96ff',
  };
});

const totalFrames = scenes.reduce((sum, s) => sum + s.durationFrames, 0);
const props = {
  title: storyboard.title,
  topic: storyboard.topic,
  domain: 'language',
  durationFrames: totalFrames,
  scenes,
};

const taskDir = path.join(remotionDir, '.generated', 'storyboard-lesson');
fs.rmSync(taskDir, { recursive: true, force: true });
fs.mkdirSync(path.join(taskDir, 'three'), { recursive: true });

fs.writeFileSync(
  path.join(taskDir, 'index.ts'),
  'import { registerRoot } from "remotion";\nimport { RemotionRoot } from "./Root";\n\nregisterRoot(RemotionRoot);\n',
  'utf-8',
);
fs.writeFileSync(
  path.join(taskDir, 'Root.tsx'),
  [
    'import React from "react";',
    'import { Composition } from "remotion";',
    'import { GeneratedLesson } from "./GeneratedLesson";',
    '',
    'export const RemotionRoot: React.FC = () => {',
    `  const defaultProps = { title: "", topic: "", scenes: [], durationFrames: ${totalFrames} };`,
    '  return (',
    '    <Composition',
    '      id="StoryboardLesson"',
    '      component={GeneratedLesson}',
    '      fps={30}',
    '      width={1920}',
    '      height={1080}',
    '      defaultProps={defaultProps}',
    '      calculateMetadata={({ props: currentProps }) => ({',
    '        durationInFrames: Number((currentProps as any).durationFrames) || defaultProps.durationFrames,',
    '        props: currentProps,',
    '      })}',
    '    />',
    '  );',
    '};',
    '',
  ].join('\n'),
  'utf-8',
);
fs.writeFileSync(path.join(taskDir, 'GeneratedLesson.tsx'), extractLessonTemplate(), 'utf-8');
for (const file of readStageFiles()) {
  const target = path.join(taskDir, file.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.content, 'utf-8');
}
fs.writeFileSync(path.join(taskDir, 'props.json'), JSON.stringify(props), 'utf-8');

const entry = path.join(taskDir, 'index.ts');
console.log(
  `[storyboard] ${scenes.length} scenes, ${totalFrames} frames (${(totalFrames / FPS).toFixed(0)}s)`,
);
console.log(
  '[storyboard] 分支：' +
    scenes
      .map((s, i) => {
        const it = s.interaction;
        const branch = !it
          ? s.sceneGraph
            ? 'graph'
            : 'plain'
          : it.action3d
            ? `3d:${it.action3d.motion}`
            : `2d:${it.puppet ? it.puppet.motion : '?'}`;
        return `${i + 1}=${branch}`;
      })
      .join(', '),
);

const stillIdx = process.argv.indexOf('--still');
if (stillIdx >= 0) {
  const frame = Number(process.argv[stillIdx + 1]) || 40;
  const output = path.join('out', `storyboard-${frame}.png`);
  execFileSync(
    'npx',
    ['remotion', 'still', entry, 'StoryboardLesson', output, `--frame=${frame}`, '--props=' + path.join(taskDir, 'props.json'), '--log=error'],
    { cwd: remotionDir, stdio: 'inherit', shell: true },
  );
  console.log(`[storyboard] still → ${output}`);
  process.exit(0);
}

const output = path.join('out', 'storyboard-5scenes.mp4');
execFileSync(
  'npx',
  ['remotion', 'render', entry, 'StoryboardLesson', output, '--props=' + path.join(taskDir, 'props.json'), '--concurrency=4', '--log=error'],
  { cwd: remotionDir, stdio: 'inherit', shell: true },
);
console.log(`[storyboard] video → ${output}`);
