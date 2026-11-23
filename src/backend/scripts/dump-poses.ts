/**
 * 姿态回归基线：把每个动作原语在若干帧上的 Pose 全量导出成 JSON。
 *
 * 为什么不是抽帧比像素：`poseAt` 是纯函数，姿态完全决定画面里的角色；
 * 比 Pose 能直接把"动作有没有被改坏"钉死，而且不需要跑 33 次 Remotion
 * （每次一分钟起步），拿到的差异也是可读的数字而不是一张图片。
 *
 * 用法（改动前后各跑一次，然后 diff）：
 *   npx ts-node --transpile-only scripts/dump-poses.ts --out ../video-remotion/out/pose-after.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { MOTION_OPS, poseAt, type MotionInput } from '../../video-remotion/src/character/pose';

/** 每个动作的典型时长与运动学参数（与装配层的常用取值一致） */
const CASES: Record<string, { durationFrames: number; extra?: Partial<MotionInput> }> = {
  idle: { durationFrames: 90 },
  speak: { durationFrames: 90 },
  point: { durationFrames: 90 },
  walk: { durationFrames: 120, extra: { start: [-2, 0.66, 0], end: [0.5, 0.66, 0] } },
  enter: { durationFrames: 60, extra: { start: [-2.2, 0.66, 0], end: [-0.4, 0.66, 0] } },
  climb: { durationFrames: 150, extra: { start: [-0.6, 0.66, 0], end: [-0.6, 2.0, 0], steps: 4 } },
  slide: { durationFrames: 90, extra: { start: [0.66, 2.6, 0], end: [4.26, 0.3, 0] } },
  dribble: { durationFrames: 60, extra: { bounce: { periodFrames: 24, height: 0.3 }, ballRestY: 0.16 } },
  cheer: { durationFrames: 60 },
  sit: { durationFrames: 90 },
  hold: { durationFrames: 90 },
  // 数据式动作（motion-clips.ts）。归一化时间让它们对时长不敏感，
  // 这里给 90 帧只是为了让 dump 有一致的采样点。
  wave: { durationFrames: 90 },
  clap: { durationFrames: 90 },
  hips: { durationFrames: 90 },
};

/** 取 0/25/50/75/100% 五帧：起、过程、末，接缝问题（末帧跳变）也在里面 */
const RATIOS = [0, 0.25, 0.5, 0.75, 1];

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const roundPose = (pose: Record<string, any>) => {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(pose)) {
    out[key] = Array.isArray(value) ? value.map(round) : typeof value === 'number' ? round(value) : value;
  }
  return out;
};

const report: Record<string, Record<string, unknown>> = {};
for (const motion of MOTION_OPS) {
  const spec = CASES[motion] ?? { durationFrames: 90 };
  const frames: Record<string, unknown> = {};
  for (const ratio of RATIOS) {
    const frame = Math.round(ratio * (spec.durationFrames - 1));
    const input: MotionInput = { motion, durationFrames: spec.durationFrames, ...(spec.extra ?? {}) };
    frames[String(frame)] = roundPose(poseAt(input, frame) as unknown as Record<string, any>);
  }
  report[motion] = { durationFrames: spec.durationFrames, frames };
}

const outIndex = process.argv.indexOf('--out');
const outPath =
  outIndex > 0
    ? path.resolve(process.cwd(), process.argv[outIndex + 1])
    : path.resolve(process.cwd(), '../video-remotion/out/pose-dump.json');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

const motions = Object.keys(report);
const frameCount = motions.reduce((sum, m) => sum + Object.keys(report[m].frames as object).length, 0);
console.log(`dumped ${motions.length} motions / ${frameCount} frames -> ${outPath}`);
if (motions.length !== MOTION_OPS.length) {
  console.error(`WARN: CASES 与 MOTION_OPS 数量不一致（${motions.length} vs ${MOTION_OPS.length}）`);
  process.exitCode = 1;
}
