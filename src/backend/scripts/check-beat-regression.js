/**
 * beats 解释器的回归边界：无 beats 的旧分镜必须逐像素不变。
 *
 * 做法：从 git HEAD 取出改动前的内置模板，与当前模板用同一份 scenes/props
 * 各渲一遍旧路径帧，PNG 逐字节对比。任何一帧不同即退出码 1。
 * 新增的 beats 分支全部以 beatStateAt() === null 为闸门，理论上旧路径零差异；
 * 这个脚本就是把"理论上"变成每次改模板都能跑的证据。
 *
 * 用法：node scripts/check-beat-regression.js [--frames=50,1100,...] [--base-service=<path>]
 * 前置：先跑 node scripts/preview-prepare.js 同步当前镜像。
 * 基线默认取 storage/beat-regression/base-service.ts（beats 编辑前的工作区副本，
 * 由 make-base.js 从会话 transcript 逆序回放 Edit 重建）。HEAD 不能当基线：
 * 工作区长期带有无关未提交改动（字幕 karaoke 等），HEAD 与生产渲染模板不一致。
 * 基线只隔离 beats 这一个变量：工作区若再出现非 beats 的有意改动（如 2026-11-15
 * 字幕节奏改按屏长铺满，系会话外编辑），需把该改动同步进 base-service.ts，
 * 否则回归会把无关改动误报成 beats 回归。同步前先确认镜像与当前模板一致。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..', '..');
const remotionDir = path.join(backendDir, '..', 'video-remotion');
const curDir = path.join(remotionDir, 'src', '__preview');
const baseDir = path.join(remotionDir, 'src', '__preview_base');
const outDir = path.join(repoRoot, 'storage', 'beat-regression');

const argv = process.argv.slice(2);
const framesArg = argv.find((a) => a.startsWith('--frames='));
// 默认覆盖：cycle/split/单主体/画板/抽象符号/环境背景 六条旧路径
const frames = framesArg
  ? framesArg.slice(9).split(',').map(Number)
  : [50, 1100, 1300, 2700, 1500, 1900];

function extractTemplate(source) {
  const anchor = 'return String.raw`';
  const start = source.indexOf(anchor);
  const bodyStart = start + anchor.length;
  const end = source.indexOf('`;', bodyStart);
  if (start < 0 || end < 0) throw new Error('template extraction failed');
  return source.slice(bodyStart, end).replace('${JSON.stringify(ANIMAL_EMOJI_MAP)}', '{}');
}

const baseArg = argv.find((a) => a.startsWith('--base-service='));
const defaultBase = path.join(outDir, 'base-service.ts');
const headSource = baseArg
  ? fs.readFileSync(baseArg.slice(15), 'utf8')
  : fs.existsSync(defaultBase)
    ? fs.readFileSync(defaultBase, 'utf8')
    : execFileSync('git', ['show', 'HEAD:src/backend/src/modules/learning/video-generation-agent.service.ts'], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    }).toString('utf8');

fs.mkdirSync(baseDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(baseDir, 'GeneratedLesson.tsx'), extractTemplate(headSource), 'utf8');
// scenes/props 与当前镜像完全一致：旧模板不认识 choreography 字段，运行时直接忽略
fs.copyFileSync(path.join(curDir, 'Root.tsx'), path.join(baseDir, 'Root.tsx'));
fs.copyFileSync(path.join(curDir, 'index.ts'), path.join(baseDir, 'index.ts'));

function render(entry, frame, out) {
  execFileSync(
    'npx',
    ['remotion', 'still', entry, 'LessonPreview', out, '--frame=' + frame, '--log=error'],
    { cwd: remotionDir, shell: true, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 },
  );
}

let diffs = 0;
for (const frame of frames) {
  const cur = path.join(outDir, 'cur-f' + frame + '.png');
  const base = path.join(outDir, 'base-f' + frame + '.png');
  try {
    render('src/__preview/index.ts', frame, cur);
    render('src/__preview_base/index.ts', frame, base);
  } catch (err) {
    console.log('f' + frame + ' RENDER_FAIL ' + String(err.stderr || err.message).slice(-400));
    diffs += 1;
    continue;
  }
  const same = fs.readFileSync(cur).equals(fs.readFileSync(base));
  console.log('f' + frame + ' ' + (same ? 'EQUAL' : 'DIFF'));
  if (!same) diffs += 1;
}
console.log('frames=' + frames.length + ' diffs=' + diffs);
process.exit(diffs === 0 ? 0 : 1);