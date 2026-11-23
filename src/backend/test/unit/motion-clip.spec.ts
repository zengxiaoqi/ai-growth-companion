/**
 * 动作关键帧表的守卫测试。
 *
 * 这套测试要挡住三件事，都不报错、只让画面"悄悄不对"：
 *
 *  1. 后端与渲染层的动作清单漂移：后端放行一个渲染器不认识的动词 →
 *     出片时静默退回 idle，"小熊在挥手"变成"小熊站着"；
 *  2. 关键帧数据坏了：手超出臂长、脚穿地、时间不递增 —— 这些都能算出来，
 *     不该靠抽帧用人眼看；
 *  3. 归一化时间失效：同一份动作在长幕里演不完 / 在短幕里跳帧。
 *
 * 还有一条是"通用性"的证明：`MOTION_CLIPS` 的键是开放字符串，编译器不再
 * 替我们检查"每个动作都有实现"。这里改成遍历真实数据全量校验，
 * 后加的动作也会被扫到。
 */
import {
  MOTION_CLIPS,
  type MotionClip,
} from '../../../video-remotion/src/character/motion-clips';
import {
  MOTION_OPS,
  SPEC,
  STAND_POSE,
  normalizeClip,
  poseAt,
  poseFromClip,
} from '../../../video-remotion/src/character/pose';
import {
  PUPPET_MOTIONS,
  VERB_AS_MOTION,
} from '../../src/modules/learning/video/scene-interaction';

const clips = Object.entries(MOTION_CLIPS);
const SAMPLES = Array.from({ length: 25 }, (_, i) => i / 24);

const reach = (hand: readonly number[], side: 1 | -1) => {
  const dx = hand[0] - side * SPEC.shoulder[0];
  const dy = hand[1] - SPEC.shoulder[1];
  const dz = hand[2] - SPEC.shoulder[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

describe('动作词汇表', () => {
  it('后端能演的动作 == 渲染层能演的动作（防漂移）', () => {
    // 动作表里还有两个只走三维舞台的原语（slide / dribble），它们不进 2D 木偶，
    // 所以比对时要把这两个剔除——不比的话，这条断言会因为"3D 动作不在 2D 表里"
    // 永远红着，最后一定会被人改成 expect.anything()。
    const puppetCapable = MOTION_OPS.filter((id) => !['slide', 'dribble'].includes(id));
    expect([...PUPPET_MOTIONS].sort()).toEqual([...puppetCapable].sort());
  });

  it('每个数据式动作都进了动作表，且声明了自己的动词', () => {
    for (const [id, clip] of clips) {
      expect(MOTION_OPS).toContain(id);
      expect(clip.verbs.length).toBeGreaterThan(0);
    }
  });

  it('新动词能在契约层映射到动作（挥手 / 拍手 / 叉腰）', () => {
    expect(VERB_AS_MOTION.wave).toBe('wave');
    expect(VERB_AS_MOTION.clap).toBe('clap');
    expect(VERB_AS_MOTION.hips).toBe('hips');
  });
});

describe('关键帧数据', () => {
  it('现有全部 clip 都通过校验', () => {
    for (const [id, clip] of clips) {
      expect({ id, issues: normalizeClip(clip) }).toEqual({ id, issues: [] });
    }
  });

  it('手超出臂长会被抓住（不是靠人眼看）', () => {
    const bad: MotionClip = {
      id: 'bad-reach',
      verbs: ['x'],
      keys: [
        { at: 0, pose: {} },
        // 肩在 (0.28, 0.42)，这个点离肩 0.9 > armLen(0.54)
        { at: 1, pose: { handR: [1.1, 0.6, 0.02] } },
      ],
    };
    expect(normalizeClip(bad).join(' ')).toContain('右手离肩');
  });

  it('下蹲没抬脚（脚穿地）会被抓住', () => {
    const bad: MotionClip = {
      id: 'bad-ground',
      verbs: ['x'],
      keys: [
        { at: 0, pose: {} },
        // 重心下压 0.1 但脚没抬：脚底 -0.62 → 世界 -0.06，插进地面
        { at: 1, pose: { dy: -0.1 } },
      ],
    };
    expect(normalizeClip(bad).join(' ')).toContain('穿地');
  });

  it('首末帧缺失 / 时间不递增 / 未知通道都会被抓住', () => {
    expect(normalizeClip({ id: 'a', verbs: ['x'], keys: [{ at: 0.2, pose: {} }, { at: 0.8, pose: {} }] }).join(' '))
      .toContain('首帧');
    expect(normalizeClip({ id: 'b', verbs: ['x'], keys: [{ at: 0, pose: {} }, { at: 0.5, pose: {} }, { at: 0.5, pose: {} }, { at: 1, pose: {} }] }).join(' '))
      .toContain('严格递增');
    expect(normalizeClip({ id: 'c', verbs: ['x'], keys: [{ at: 0, pose: {} }, { at: 1, pose: { handl: [0, 0, 0] } as any }] }).join(' '))
      .toContain('未知通道');
  });
});

describe('插值结果', () => {
  it('首帧等于站姿，末帧回到站姿（起止不跳变）', () => {
    for (const [id, clip] of clips) {
      const head = poseFromClip(clip, 0);
      const tail = poseFromClip(clip, 1);
      expect({ id, handR: head.handR, footL: head.footL }).toEqual({
        id,
        handR: STAND_POSE.handR,
        footL: STAND_POSE.footL,
      });
      // 末帧同样回到站姿：动作演完必须能接下一幕，不能停在一个奇怪的姿势上
      expect({ id, handR: tail.handR }).toEqual({ id, handR: STAND_POSE.handR });
    }
  });

  it('每一帧的手都在臂长内、脚都不穿地', () => {
    for (const [id, clip] of clips) {
      for (const t of SAMPLES) {
        const pose = poseFromClip(clip, t);
        expect({ id, t, ok: reach(pose.handR, 1) <= SPEC.armLen + 1e-6 }).toEqual({ id, t, ok: true });
        expect({ id, t, ok: reach(pose.handL, -1) <= SPEC.armLen + 1e-6 }).toEqual({ id, t, ok: true });
        expect({ id, t, ok: pose.root[1] + pose.footL[1] >= -1e-6 }).toEqual({ id, t, ok: true });
        expect({ id, t, ok: Number.isFinite(pose.root[1]) }).toEqual({ id, t, ok: true });
      }
    }
  });

  it('归一化时间：同一份动作在短幕与长幕里都演完整', () => {
    // 挥手在 1.5s(45 帧) 与 6s(180 帧) 里，举起手的时段占比应当接近
    const raisedRatio = (frames: number) => {
      let raised = 0;
      for (let f = 0; f < frames; f += 1) {
        const pose = poseAt({ motion: 'wave', durationFrames: frames }, f);
        if (pose.handR[1] > SPEC.shoulder[1] + 0.2) raised += 1;
      }
      return raised / frames;
    };
    expect(Math.abs(raisedRatio(45) - raisedRatio(180))).toBeLessThan(0.05);
  });

  it('未知动作退回 idle，不抛错', () => {
    const unknown = poseAt({ motion: 'no-such-motion', durationFrames: 60 }, 10);
    const idle = poseAt({ motion: 'idle', durationFrames: 60 }, 10);
    expect(unknown).toEqual(idle);
  });
});
