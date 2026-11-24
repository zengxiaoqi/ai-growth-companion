/**
 * 把"舞台/角色"源码同步成后端可以直接内联进任务目录的字符串常量。
 *
 * 为什么需要这一步：
 * 生成的分镜 TSX 是"字符串产物"（DynamicRemotionFile.content），后端不能 import
 * 一个 .tsx 文件，只能在渲染时把源码原样写进 .generated/remotion-tasks/task-<id>/。
 * 而组件本身必须在 Remotion 工程里可类型检查、可预览。两边共用一份源码、
 * 由脚本转成 JSON 字符串常量（用 JSON.stringify 避免手写转义），改完跑一次即可。
 *
 * 为什么是"一组文件"而不是一个文件：
 * 姿态解算（character/pose.ts）被 3D 舞台和 2D 角色共用，任何一个渲染器要用它，
 * 任务目录里就得有它。所以同步的单位是"渲染层的一组源码"，不是单个组件。
 * 写入位置与源目录结构一致（character/、three/），相对 import 才不会失效。
 *
 * 用法：node scripts/sync-three-stage.cjs  （backend 目录下 npm run sync:three-stage）
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const remotionSrc = path.join(repoRoot, 'src', 'video-remotion', 'src');

/** 按依赖顺序排列：被依赖的放前面，便于人工阅读产物 */
const SOURCES = [
  ['character/motion-clips.ts', path.join(remotionSrc, 'character', 'motion-clips.ts')],
  ['character/pose.ts', path.join(remotionSrc, 'character', 'pose.ts')],
  // 取景定律与布景注册表：两个渲染器都要 import，必须在角色/舞台之前写进任务目录
  ['character/stage-layout.ts', path.join(remotionSrc, 'character', 'stage-layout.ts')],
  ['character/setpiece.ts', path.join(remotionSrc, 'character', 'setpiece.ts')],
  // 场地配方（数据）与装饰资产（组件）。world 依赖配方、WorldLayer 依赖两者，
  // 少同步一个，任务目录里就会在 import 处炸——而且只在线上出片时才炸。
  ['character/venue-recipes.ts', path.join(remotionSrc, 'character', 'venue-recipes.ts')],
  // 场地层：整节课共用的世界 + 镜头。渲染器依赖它，必须排在它们之前
  ['character/world.ts', path.join(remotionSrc, 'character', 'world.ts')],
  ['character/venue-assets.tsx', path.join(remotionSrc, 'character', 'venue-assets.tsx')],
  ['character/WorldLayer.tsx', path.join(remotionSrc, 'character', 'WorldLayer.tsx')],
  // 道具：几何数据（prop-art.ts）与渲染器（prop-glyph.tsx）分开同步。
  // 数据层被后端单测直接 import，所以必须是 .ts；渲染器只有模板用。
  ['character/prop-art.ts', path.join(remotionSrc, 'character', 'prop-art.ts')],
  ['character/prop-glyph.tsx', path.join(remotionSrc, 'character', 'prop-glyph.tsx')],
  ['character/Puppet2D.tsx', path.join(remotionSrc, 'character', 'Puppet2D.tsx')],
  ['three/ThreeActionStage.tsx', path.join(remotionSrc, 'three', 'ThreeActionStage.tsx')],
];

const targetPath = path.join(
  __dirname,
  '..',
  'src',
  'modules',
  'learning',
  'video',
  'stage-template.ts',
);

const files = [];
for (const [taskPath, sourcePath] of SOURCES) {
  if (!fs.existsSync(sourcePath)) {
    // 2D 角色还没落地时不阻塞 3D 的同步；真正需要它时后端会因为缺文件而报错，
    // 这里只提示，不静默跳过（否则线上会出现"import 找不到模块"的难查故障）。
    console.warn(`[sync-stage] skip (missing): ${path.relative(repoRoot, sourcePath)}`);
    continue;
  }
  // 换行统一成 LF 再嵌入：源文件在磁盘上是什么换行取决于谁用什么编辑器存过
  // （Windows 上是 CRLF），而生成物是要提交的。不统一的话，某个文件被编辑器
  // 存一次就会让这里多出"整行都变了"的 diff——实际内容一个字没改，review 时
  // 只能靠人眼分辨，最后没人敢看。
  files.push({
    path: taskPath,
    content: fs.readFileSync(sourcePath, 'utf-8').replace(/\r\n/g, '\n'),
  });
}

if (files.length === 0) {
  console.error('[sync-stage] no source files found');
  process.exit(1);
}

const header = [
  '/**',
  ' * 渲染层源码常量（自动生成，请勿手改）。',
  ' *',
  ' * 来源：src/video-remotion/src/character、src/video-remotion/src/three',
  ' * 重生成：cd src/backend && npm run sync:three-stage',
  ' *',
  ' * 生成任务目录时由 video-generation-agent.service.ts 逐个写入（路径与源目录一致），',
  ' * 模板只负责 import。用 JSON 字符串字面量而不是模板字符串：源码里的反引号、',
  ' * ${}、反斜杠都不用再转义。',
  ' */',
  '',
  'export type StageTemplateFile = { path: string; content: string };',
  '',
  '',
].join('\n');

const body = `export const STAGE_TEMPLATE_FILES: StageTemplateFile[] = ${JSON.stringify(files, null, 2)};\n`;

fs.writeFileSync(targetPath, header + body, 'utf-8');

// 旧文件（单文件常量）如果还在，删掉避免两处常量漂移
const legacy = path.join(__dirname, '..', 'src', 'modules', 'learning', 'video', 'three-stage-template.ts');
if (fs.existsSync(legacy)) {
  fs.unlinkSync(legacy);
  console.log(`[sync-stage] removed legacy ${path.relative(repoRoot, legacy)}`);
}

const total = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf-8'), 0);
console.log(
  `[sync-stage] wrote ${path.relative(repoRoot, targetPath)} — ${files.length} files, ${(total / 1024).toFixed(1)} KB`,
);
