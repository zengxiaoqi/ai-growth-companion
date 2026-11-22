/**
 * 把 3D 舞台组件同步成后端可以直接内联进任务目录的字符串常量。
 *
 * 为什么需要这一步：
 * 生成的分镜 TSX 是"字符串产物"（DynamicRemotionFile.content），后端不能 import
 * 一个 .tsx 文件，只能在渲染时把源码原样写进 .generated/remotion-tasks/task-<id>/。
 * 而组件本身必须在 Remotion 工程里可类型检查、可预览。两边共用一份源码、
 * 由脚本转成 JSON 字符串常量（用 JSON.stringify 避免手写转义），改完组件跑一次即可。
 *
 * 用法：node scripts/sync-three-stage.cjs  （backend 目录下 npm run sync:three-stage）
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const sourcePath = path.join(repoRoot, 'src', 'video-remotion', 'src', 'three', 'ThreeActionStage.tsx');
const targetPath = path.join(
  __dirname,
  '..',
  'src',
  'modules',
  'learning',
  'video',
  'three-stage-template.ts',
);

if (!fs.existsSync(sourcePath)) {
  console.error(`[sync-three-stage] source not found: ${sourcePath}`);
  process.exit(1);
}

const code = fs.readFileSync(sourcePath, 'utf-8');
const header = [
  '/**',
  ' * 3D 舞台源码常量（自动生成，请勿手改）。',
  ' *',
  ' * 来源：src/video-remotion/src/three/ThreeActionStage.tsx',
  ' * 重生成：cd src/backend && npm run sync:three-stage',
  ' *',
  ' * 生成任务目录时由 video-generation-agent.service.ts 原样写入',
  ' * three/ThreeActionStage.tsx，GeneratedLesson.tsx 再 import 它。',
  ' * 用 JSON 字符串字面量而不是模板字符串：源码里的反引号、${}、反斜杠都不用再转义。',
  ' */',
  '',
  '',
].join('\n');

fs.writeFileSync(
  targetPath,
  `${header}export const THREE_ACTION_STAGE_TSX: string = ${JSON.stringify(code)};\n`,
  'utf-8',
);

const kb = (Buffer.byteLength(code, 'utf-8') / 1024).toFixed(1);
console.log(`[sync-three-stage] wrote ${path.relative(repoRoot, targetPath)} (${kb} KB)`);
