/**
 * 三维动作资产注册表的契约测试。
 *
 * 这一层的唯一职责是"把意图变成确定的数字与资产"，所以测试盯三件事：
 *  1. 白名单：没登记的角色/道具回落到默认值，绝不产生不存在的模型路径；
 *  2. 一致性：动作与道具必须匹配（滑梯配 slide、球配 dribble），不匹配就整份拒绝；
 *  3. 确定性：同一份输入永远解析出同一组坐标，且动作时长被压进场景时长。
 */

import {
  ACTOR_RIGS,
  DEFAULT_ACTOR_RIG,
  MOTION_DEFAULTS,
  resolveAction3D,
  resolveActorRig,
  resolvePropMesh,
  resolvePuppetSequence,
} from '../../src/modules/learning/video/action3d-registry';

describe('resolveActorRig', () => {
  it('已登记角色返回自己的造型参数', () => {
    expect(resolveActorRig('bear').fur).toBe(ACTOR_RIGS.bear.fur);
    expect(resolveActorRig('RABBIT').ears).toBe('long');
  });

  it('未登记角色回落默认形象，不会返回 undefined', () => {
    expect(resolveActorRig('unicorn-with-hat')).toEqual(DEFAULT_ACTOR_RIG);
    expect(resolveActorRig(undefined)).toEqual(DEFAULT_ACTOR_RIG);
  });
});

describe('resolvePropMesh', () => {
  it('只认登记过的道具', () => {
    expect(resolvePropMesh('slide')).toBe('slide');
    expect(resolvePropMesh('BALL')).toBe('ball');
    expect(resolvePropMesh('cookie')).toBeNull();
    expect(resolvePropMesh(undefined)).toBeNull();
  });
});

describe('resolveAction3D', () => {
  it('只给 verb 也能解析：坐标与时长由注册表补齐', () => {
    const r = resolveAction3D(undefined, { verb: 'slide', actorId: 'bear', sceneDurationFrames: 180 });
    expect(r).toMatchObject({
      motion: 'slide',
      propId: 'slide',
      renderer: '3d-procedural',
      actorId: 'bear',
    });
    expect(r?.start).toEqual(MOTION_DEFAULTS.slide.start);
    expect(r?.end).toEqual(MOTION_DEFAULTS.slide.end);
    // 动作时长不超过默认值，且必须落在场景时长之内（留出收尾）
    expect(r!.durationFrames).toBeLessThanOrEqual(MOTION_DEFAULTS.slide.durationFrames);
    expect(r!.durationFrames).toBeLessThan(180);
  });

  it('场景很短时把动作压进场景，但不低于可控下限', () => {
    const r = resolveAction3D(undefined, { verb: 'dribble', actorId: 'bear', sceneDurationFrames: 20 });
    expect(r!.durationFrames).toBe(24);
  });

  it('动作与道具不匹配时整份拒绝（防止"骑着球滑滑梯"）', () => {
    expect(resolveAction3D({ renderer: '3d-procedural', motion: 'slide', actorId: 'bear', propId: 'ball' })).toBeNull();
    expect(resolveAction3D(undefined, { verb: 'slide', actorId: 'bear', propId: 'ball' })).toBeNull();
  });

  it('没有动作也没有对应动词时返回 null，调用方退回 2D 演出', () => {
    expect(resolveAction3D(undefined, { verb: 'handover', actorId: 'bear' })).toBeNull();
    expect(resolveAction3D(undefined, {})).toBeNull();
  });

  it('拍球带稳定的周期与静置高度，接触帧固定在周期起点', () => {
    const a = resolveAction3D({ renderer: '3d-procedural', motion: 'dribble', actorId: 'bear' }, {});
    const b = resolveAction3D({ renderer: '3d-procedural', motion: 'dribble', actorId: 'bear' }, {});
    expect(a).toEqual(b);
    expect(a?.bounce?.periodFrames).toBe(18);
    expect(a?.contactFrame).toBe(0);
    expect(a?.ballRestY).toBe(0.27);
  });

  it('滑梯的接触帧是落地点，即动作末帧', () => {
    const r = resolveAction3D({ renderer: '3d-procedural', motion: 'slide', actorId: 'bear' }, {});
    expect(r?.contactFrame).toBe(r?.durationFrames);
  });
});

/**
 * 一幕多动作的分帧。
 *
 * 这一层只做一件事：把"这一幕要演三下"翻译成"每一下各占多少帧"。
 * 必须钉住的是**总帧数守恒**与**每段有下限**——0 帧段在渲染层等于抽帧式跳变，
 * 比不演更糟，所以分不下去时宁可整串作废。
 */
describe('resolvePuppetSequence', () => {
  const total = (seq: Array<{ durationFrames: number }>) =>
    seq.reduce((sum, item) => sum + item.durationFrames, 0);

  it('三段地面动作的总帧数正好等于场景帧数', () => {
    const seq = resolvePuppetSequence(['walk', 'point', 'speak'], { sceneDurationFrames: 240 });
    expect(seq).not.toBeNull();
    expect(total(seq!)).toBe(240);
    expect(seq!.map((item) => item.motion)).toEqual(['walk', 'point', 'speak']);
  });

  it('帧数按动作的自然时长分配：走路拿到的比指认多', () => {
    const seq = resolvePuppetSequence(['walk', 'point'], { sceneDurationFrames: 240 })!;
    expect(seq[0].durationFrames).toBeGreaterThan(seq[1].durationFrames);
  });

  it('每段至少 24 帧：短场景里也不给出 0 帧的段落', () => {
    const seq = resolvePuppetSequence(['walk', 'point', 'speak'], { sceneDurationFrames: 96 });
    if (seq) {
      expect(Math.min(...seq.map((s) => s.durationFrames))).toBeGreaterThanOrEqual(24);
      expect(total(seq)).toBe(96);
    }
  });

  it('场景太短放不下两个动作时整串作废（返回 null，而不是挤出 0 帧段）', () => {
    expect(resolvePuppetSequence(['walk', 'point'], { sceneDurationFrames: 30 })).toBeNull();
  });

  it('单个动作不构成序列，交回单动作路径', () => {
    expect(resolvePuppetSequence(['walk'], { sceneDurationFrames: 240 })).toBeNull();
  });

  it('保留每个动作自己的默认轨迹：串演不改坐标，位移由注册表决定', () => {
    const seq = resolvePuppetSequence(['walk', 'climb'], { sceneDurationFrames: 300 })!;
    expect(seq[0].start).toEqual([-1.6, 0.66, 0]);
    expect(seq[0].end).toEqual([0, 0.66, 0]);
    expect(seq[1].start).toEqual([-0.6, 0.66, 0]);
    expect(seq[1].end).toEqual([-0.6, 1.5, 0]);
  });
});
