/**
 * 3D 分镜端到端抽帧校验。
 *
 * 为什么需要它：
 * 3D 舞台由三块拼起来——后端 `buildGeneratedLessonTsx()` 的模板串、
 * 模板里 `import "./three/ThreeActionStage"`、以及 props 里解析好的 action3d。
 * 单独预览组件通过，不代表拼进真实任务目录后还能渲染（路径、类型、props 形状
 * 任何一环错都只在出片时才炸）。这个脚本把后端模板原样取出来写成任务目录，
 * 按 renderGeneratedComposition 的方式渲染静帧，等价于线上出片的前半段。
 *
 * 用法（src/video-remotion 下）：
 *   node scripts/render-3d-lesson.cjs slide 0 30 89
 *   node scripts/render-3d-lesson.cjs dribble 0 9 18
 * 产物落在 out/it-<motion>-<frame>.png。
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
const stageSourcePath = path.join(remotionDir, 'src', 'three', 'ThreeActionStage.tsx');

const motion = (process.argv[2] || 'slide').toLowerCase();
const frames = process.argv.slice(3).map(Number).filter((n) => Number.isFinite(n));

if (!['slide', 'dribble'].includes(motion)) {
  console.error('motion must be slide or dribble');
  process.exit(1);
}

/** 从服务源码里取出 buildGeneratedLessonTsx 的 String.raw 模板（与 check 脚本同一套锚点） */
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

const stageScene = {
  slide: {
    verb: 'slide',
    propId: 'slide',
    action3d: {
      renderer: '3d-procedural',
      motion: 'slide',
      actorId: 'bear',
      propId: 'slide',
      start: [-3.1, 2.7, 0],
      end: [2.9, 0.3, 0],
      durationFrames: 90,
      contactFrame: 90,
    },
    title: '小熊滑滑梯',
    narration: '小熊爬到滑梯顶端，顺着滑梯滑下来，稳稳地落在草地上。',
    onScreenText: '滑下来',
  },
  dribble: {
    verb: 'dribble',
    propId: 'ball',
    action3d: {
      renderer: '3d-procedural',
      motion: 'dribble',
      actorId: 'bear',
      propId: 'ball',
      start: [0.9, 0.95, 0.35],
      end: [0.9, 0.95, 0.35],
      bounce: { periodFrames: 18, height: 0.62 },
      ballRestY: 0.27,
      durationFrames: 96,
      contactFrame: 0,
    },
    title: '小熊拍球',
    narration: '小熊用手拍皮球，皮球落下去又弹起来。',
    onScreenText: '拍一拍',
  },
}[motion];

const RIG = { fur: '#a9744f', belly: '#f0d3b2', ears: 'round', tail: 'stub', scale: 1 };

const scene = {
  id: 'scene-1',
  title: stageScene.title,
  narration: stageScene.narration,
  onScreenText: stageScene.onScreenText,
  visualDescription: stageScene.narration,
  assetKey: 'bear',
  assetTags: ['slide', 'ball'],
  props: [{ id: stageScene.propId, label: stageScene.propId === 'slide' ? '滑梯' : '皮球' }],
  interaction: {
    verb: stageScene.verb,
    actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
    propId: stageScene.propId,
    action3d: { ...stageScene.action3d, rig: RIG },
  },
  action: 'run',
  habitat: 'grassland',
  backgroundStyle: 'environment',
  generatedVisual: 'bear-run-grassland',
  template: 'science.animal-abilities',
  durationFrames: 120,
  accentColor: '#4d96ff',
};

const props = {
  title: stageScene.title,
  topic: stageScene.title,
  domain: 'social',
  durationFrames: 120,
  scenes: [scene],
};

const taskDir = path.join(remotionDir, '.generated', 'it-3d');
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
    '  const defaultProps = { title: "", topic: "", scenes: [], durationFrames: 120 };',
    '  return (',
    '    <Composition',
    '      id="GeneratedLesson-it3d"',
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
fs.copyFileSync(stageSourcePath, path.join(taskDir, 'three', 'ThreeActionStage.tsx'));
fs.writeFileSync(path.join(taskDir, 'props.json'), JSON.stringify(props), 'utf-8');

const entry = path.join(taskDir, 'index.ts');
console.log(`[it-3d] task dir: ${path.relative(remotionDir, taskDir)}`);

for (const frame of frames.length ? frames : [30]) {
  const output = path.join('out', `it-${motion}-${frame}.png`);
  console.log(`[it-3d] rendering frame ${frame} → ${output}`);
  execFileSync(
    'npx',
    ['remotion', 'still', entry, 'GeneratedLesson-it3d', output, `--frame=${frame}`, '--props=' + path.join(taskDir, 'props.json'), '--log=error'],
    { cwd: remotionDir, stdio: 'inherit', shell: true },
  );
}

console.log('[it-3d] done');
