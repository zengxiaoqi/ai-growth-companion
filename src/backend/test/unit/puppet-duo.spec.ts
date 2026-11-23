/**
 * 双人木偶：手的位置、站位、以及"道具该在哪"的几何约定。
 *
 * 这一组测试针对的不是某个画面好不好看，而是三件会悄悄漂移的事：
 *  1. 前伸的手臂够不够长——肩到手一旦接近或超过臂长，clampReach 会把
 *     "伸出去"悄悄改成"停在半路"，画面上是手不跟着走；
 *  2. 挂点在不在身体轮廓之外——挂点落回肚皮，道具就贴在身上，读不出"递"；
 *  3. 两个人的手之间有没有留出放道具的空当——太近是"原地换个手"，
 *     太远是"隔空传送"。
 *
 * 三条都只依赖 pose 与 world 的几何，与具体分镜无关，所以任何主题
 * （森林、河边、游乐园）都成立。
 */

import {
  ACTOR,
  SPEC,
  gripLocal,
  localToWorld,
  poseAt,
  type Pose,
  type Tri,
} from '../../../video-remotion/src/character/pose';
import { duoStations } from '../../../video-remotion/src/character/world';

const dist = (a: Tri, b: Tri) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const holdPose = (frame = 0): Pose => poseAt({ motion: 'hold', durationFrames: 90 }, frame);

const SHOULDER_R: Tri = [SPEC.shoulder[0], SPEC.shoulder[1], SPEC.shoulder[2]];
const SHOULDER_L: Tri = [-SPEC.shoulder[0], SPEC.shoulder[1], SPEC.shoulder[2]];

/** 森林（无滑梯）与游乐园（有滑梯）两种场地，覆盖两条站位分支 */
const FOREST = { venue: 'forest' as const };
const PLAYGROUND = {
  venue: 'playground' as const,
  slide: { start: [0.66, 2.6, 0] as Tri, end: [4.26, 0.3, 0] as Tri },
};

describe('托举姿势：手够得着、且在身体之外', () => {
  it('前伸的手在臂长之内（否则会被 clampReach 悄悄拉回半路）', () => {
    const pose = holdPose();
    expect(dist(SHOULDER_R, pose.handR)).toBeLessThanOrEqual(SPEC.armLen);
    expect(dist(SHOULDER_L, pose.handL)).toBeLessThanOrEqual(SPEC.armLen);
  });

  /**
   * 手臂伸得太少，正面视角里两道弯都朝内，看起来像"抱胸"而不是"递过去"。
   * 0.75 是实测下限：再短，手掌就落回躯干轮廓里。
   */
  it('前伸的手臂至少用掉 75% 的臂长（少了会读成"抱胸"）', () => {
    const pose = holdPose();
    expect(dist(SHOULDER_R, pose.handR) / SPEC.armLen).toBeGreaterThan(0.75);
  });

  it('挂点落在躯干轮廓之外（道具不该贴在肚皮上）', () => {
    const pose = holdPose();
    expect(gripLocal(pose)[0]).toBeGreaterThan(SPEC.torsoR);
  });

  it('两只手朝同一侧前伸，另一只垂在体侧（不是双手捧胸）', () => {
    const pose = holdPose();
    expect(pose.handR[0]).toBeGreaterThan(pose.handL[0]);
    // 垂着的那只手在肩线以下：这是"自然下垂"，不是"举着"
    expect(pose.handL[1]).toBeLessThan(SPEC.shoulder[1]);
  });

  it('挂点随呼吸起伏但不飘（幅度小于 2cm 的世界单位）', () => {
    const a = gripLocal(holdPose(0));
    const b = gripLocal(holdPose(12));
    expect(Math.abs(a[1] - b[1])).toBeLessThan(0.02);
  });
});

describe('挂点的世界坐标：与角色朝向同源', () => {
  it('朝向翻转时横向位置镜像、高度不变', () => {
    const pose = holdPose();
    const root: Tri = [0, SPEC.standHipY, 0];
    const right = localToWorld(root, pose, gripLocal(pose), 1);
    const left = localToWorld(root, pose, gripLocal(pose), -1);
    expect(right[0]).toBeCloseTo(-left[0], 6);
    expect(right[1]).toBeCloseTo(left[1], 6);
  });

  it('朝向哪边，手就伸向哪边（这是"面对彼此"能成立的前提）', () => {
    const pose = holdPose();
    const root: Tri = [0, SPEC.standHipY, 0];
    expect(localToWorld(root, pose, gripLocal(pose), 1)[0]).toBeGreaterThan(0);
    expect(localToWorld(root, pose, gripLocal(pose), -1)[0]).toBeLessThan(0);
  });
});

describe('双人站位：两人的手之间正好放得下一件道具', () => {
  const grips = (world: any): [number, number] => {
    const [a, b] = duoStations(world);
    const pose = holdPose();
    // 左边的角色朝右（+1），右边的朝左（-1）——这正是 Puppet2D 的默认朝向
    const g1 = localToWorld([a, SPEC.standHipY, 0], pose, gripLocal(pose), 1)[0];
    const g2 = localToWorld([b, SPEC.standHipY, 0], pose, gripLocal(pose), -1)[0];
    return [g1, g2];
  };

  const VENUES: Array<[string, any]> = [
    ['森林', FOREST],
    ['游乐园', PLAYGROUND],
  ];
  VENUES.forEach(([label, world]) => {
    it(`${label}：两只手不交叉，中间留有 0.2~0.6 个单位的空当`, () => {
      const [g1, g2] = grips(world);
      expect(g1).toBeLessThan(g2);
      expect(g2 - g1).toBeGreaterThan(0.2);
      expect(g2 - g1).toBeLessThan(0.6);
    });

    it(`${label}：两人之间至少隔着一个身宽（身体不重叠）`, () => {
      const [a, b] = duoStations(world);
      expect(b - a).toBeGreaterThan(ACTOR.bodyWidth * 1.4);
    });
  });

  it('没有滑梯时两人对称站在原点两侧（镜头只平移、不变焦）', () => {
    const [a, b] = duoStations(FOREST);
    expect(Math.abs(a + b)).toBeLessThan(1e-6);
  });

  /**
   * 游乐园里有一整座滑梯，站位不能落在它的立柱与爬梯上，
   * 否则画面上是"两个人穿在铁架子里递苹果"。
   */
  it('有滑梯时整对站在爬梯外侧（与滑梯结构不重叠）', () => {
    const [a, b] = duoStations(PLAYGROUND);
    const ladderX = 0.66 - 1.5 * (3.6 / Math.sqrt(3.6 ** 2 + 2.3 ** 2));
    expect(Math.max(a, b)).toBeLessThan(ladderX - 0.2);
  });

  it('站位不会掉出可演区域（否则镜头里只剩一角草地）', () => {
    [FOREST, PLAYGROUND].forEach((world) => {
      const [a, b] = duoStations(world);
      expect(a).toBeGreaterThan(-3.1);
      expect(b).toBeGreaterThan(a);
    });
  });
});
