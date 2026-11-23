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
/**
 * 分镜来源。
 *
 * 默认是《小熊玩滑梯》那份真实分镜；`--fixture <path>` 可以换成任意一份，
 * 这是"改动是否对所有主题生效"唯一靠得住的验证方式——只看滑梯那一份，
 * 很容易把"只有带滑梯的课才走新路径"这种漏检当成通过。
 */
const argFixture = (() => {
  const i = process.argv.indexOf('--fixture');
  return i > 0 ? process.argv[i + 1] : null;
})();
const fixturePath = argFixture
  ? path.resolve(remotionDir, argFixture)
  : path.join(repoRoot, 'src', 'backend', 'test', 'fixtures', 'slide-storyboard.json');
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
  const raw = source.slice(bodyStart, end);
  // 插值是后端常量（ANIMAL_EMOJI_MAP / VECTOR_ANIMAL_IDS / PROP_LABELS），这里
  // 一律置空。后果要说清楚，否则会被误读成产品 bug：
  //   VECTOR_ANIMAL_IDS 空了 ⇒ 所有角色都走 emoji 兜底，而兜底是同一个字形
  //   （🐺），于是"松鼠和小兔画成同一个灰狼头"。**这是 harness 的限制，
  //   不是线上行为**——线上白名单是真的，头像按 actor.id 取矢量素材。
  //   所以本脚本只能验收取景/场地/几何，不能验收角色美术。
  if (/\$\{JSON\.stringify/.test(raw)) {
    console.log('[storyboard] 注意：角色美术在离线渲染里不可信（VECTOR_ANIMAL_IDS 被置空，头像退化成同一个字形）');
  }
  return raw
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
/**
 * 场地：线上由 buildDynamicSceneProps 的 resolveLessonWorld 算好、逐幕下发同一份。
 * 这里从 action3d-registry 的 MOTION_DEFAULTS 里读出滑梯坐标（正则读源码，
 * 读不到就直接失败）——手抄一份必然漂移，而这类漂移的表现是"预览里对、线上错"，
 * 最难查。
 */
function readSlideDefaults() {
  const registryPath = path.join(
    repoRoot,
    'src',
    'backend',
    'src',
    'modules',
    'learning',
    'video',
    'action3d-registry.ts',
  );
  const source = fs.readFileSync(registryPath, 'utf8');
  const match = source.match(
    /slide:\s*\{[\s\S]*?start:\s*\[([-\d.,\s]+)\],\s*end:\s*\[([-\d.,\s]+)\]/,
  );
  if (!match) throw new Error('MOTION_DEFAULTS.slide not found in action3d-registry.ts');
  const nums = (s) => s.split(',').map((v) => Number(v.trim()));
  return { start: nums(match[1]), end: nums(match[2]) };
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const slideDefaults = readSlideDefaults();
const hasSlide = plan.some((item) => {
  const action = item.interaction;
  return (
    item.branch === '2d:climb' ||
    action?.verb === 'slide' ||
    action?.propId === 'slide' ||
    action?.action3d?.motion === 'slide'
  );
});
const world = hasSlide
  ? { venue: 'playground', slide: slideDefaults }
  : { venue: 'meadow' };

const PROP_LABELS = { slide: '滑梯', ball: '皮球' };

/**
 * 分镜 → 渲染 props 的映射。
 *
 * 与线上 buildSceneData 的关键差异只有一处：线上由 resolveAction3D / resolvePuppet
 * 把"谁在什么道具上做什么"补齐成坐标，这里直接写下注册表里的默认值。
 * 数值保持同源（climb 的 -0.55→1.5 / steps 4 就是 PUPPET_DEFAULTS.climb），
 * 所以画面与线上一致；分镜本身不做任何美化，照抄 fixture。
 */
/**
 * props 直通模式：`--props <file>`。
 *
 * 这份脚本自己注入 plan / world / habitat，只对《小熊玩滑梯》成立；别的主题
 * 必须用后端真实装配出来的 props（scripts/build-lesson-props.ts），否则测的是
 * 脚本的假设，不是产品的行为。
 */
const propsArg = (() => {
  const i = process.argv.indexOf('--props');
  return i > 0 ? process.argv[i + 1] : null;
})();

const storyboard = propsArg ? null : JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const scenes = !storyboard ? [] : storyboard.scenes.map((s, i) => {
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
    // 整节课同一份场地：滑梯在哪不取决于"这一幕用不用它"
    world,
    // 与线上同一判据：用到滑梯的幕只给 setpiece，不再摆滑梯图标
    ...(item.branch === '2d:climb' ||
    item.interaction?.propId === 'slide' ||
    item.interaction?.verb === 'slide' ||
    item.interaction?.action3d?.motion === 'slide'
      ? { setpiece: 'slide' }
      : {}),
    backgroundStyle: 'environment',
    generatedVisual: 'bear-grassland',
    template: s.animationTemplate ? s.animationTemplate.id : 'language.story-scene',
    durationFrames,
    accentColor: (storyboard.visualTheme && storyboard.visualTheme.accentColor) || '#4d96ff',
  };
});

const builtProps = {
  title: storyboard ? storyboard.title : '',
  topic: storyboard ? storyboard.topic : '',
  domain: 'language',
  durationFrames: scenes.reduce((sum, s) => sum + s.durationFrames, 0),
  scenes,
};

const props = propsArg
  ? JSON.parse(fs.readFileSync(path.resolve(remotionDir, propsArg), 'utf8'))
  : builtProps;
const totalFrames = Number(props.durationFrames) || builtProps.durationFrames;

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
  `[storyboard] ${(props.scenes || []).length} scenes, ${totalFrames} frames (${(totalFrames / FPS).toFixed(0)}s)`,
);
console.log(
  '[storyboard] 分支：' +
    (props.scenes || [])
      .map((s, i) => {
        const it = s.interaction;
        const branch = !it
          ? s.sceneGraph
            ? 'graph'
            : 'plain'
          : it.action3d
            ? `3d:${it.action3d.motion}`
            : it.puppet
              ? `2d:${it.puppet.motion}`
              : `actor:${it.verb}`;
        return `${i + 1}=${branch}`;
      })
      .join(', '),
);

// 产文件名带分镜前缀：不同主题的抽帧才不会被上一份覆盖掉
const tag = (propsArg || path.basename(fixturePath, '.json'))
  .split(/[\\/]/)
  .pop()
  .replace(/\.json$/, '')
  .replace(/\.props$/, '')
  .replace(/-storyboard$/, '');

const stillIdx = process.argv.indexOf('--still');
if (stillIdx >= 0) {
  const frame = Number(process.argv[stillIdx + 1]) || 40;
  const output = path.join('out', `${tag}-${frame}.png`);
  execFileSync(
    'npx',
    ['remotion', 'still', entry, 'StoryboardLesson', output, `--frame=${frame}`, '--props=' + path.join(taskDir, 'props.json'), '--log=error'],
    { cwd: remotionDir, stdio: 'inherit', shell: true },
  );
  console.log(`[storyboard] still → ${output}`);
  process.exit(0);
}

const output = path.join('out', `${tag}-5scenes.mp4`);
execFileSync(
  'npx',
  ['remotion', 'render', entry, 'StoryboardLesson', output, '--props=' + path.join(taskDir, 'props.json'), '--concurrency=4', '--log=error'],
  { cwd: remotionDir, stdio: 'inherit', shell: true },
);
console.log(`[storyboard] video → ${output}`);
