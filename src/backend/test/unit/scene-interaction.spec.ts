/**
 * 角色交互语法层的契约测试。
 *
 * 这一层负责把"小熊把皮球递给小兔""一起抬桌子""气泡：可以借我玩吗"
 * 这类文案里的关系变成结构化动作，让画面演出关系而不是只摆出角色。
 * 必须钉住：关系提取正确、说话者不是第一提及者时不搞反、
 * 总结场景和教学提问语不被误判成角色动作/台词。
 */

import {
  composePerformance,
  deriveInteractionFromText,
  hasAnyMotionCue,
  hasThreeMotionCue,
  normalizeSceneInteraction,
  normalizeScenePerformance,
} from '../../src/modules/learning/video/scene-interaction';
import { findAnimalMentions } from '../../src/modules/learning/animal-subjects.config';

const derive = (visual: string, opts: { onScreenText?: string; propIds?: string[]; narration?: string } = {}) =>
  deriveInteractionFromText({
    visualDescription: visual,
    narration: opts.narration,
    onScreenText: opts.onScreenText,
    mentions: findAnimalMentions(visual),
    propIds: opts.propIds || [],
  });

describe('deriveInteractionFromText', () => {
  it('把"小熊把皮球递给小兔"识别成递给：小熊是给出者、小兔是接收者', () => {
    const r = derive('小熊把皮球递给小兔，小兔双手接过', { propIds: ['ball'] });
    expect(r?.verb).toBe('handover');
    expect(r?.actors.find((a) => a.role === 'giver')?.label).toBe('小熊');
    expect(r?.actors.find((a) => a.role === 'receiver')?.label).toBe('小兔');
    expect(r?.propId).toBe('ball');
  });

  it('第一个提到的角色不是动作发出者时也不搞反（小兔想玩皮球，小熊递出去）', () => {
    const r = derive('小兔想玩红色皮球，小熊把皮球轻轻递出去', { propIds: ['ball'] });
    expect(r?.verb).toBe('handover');
    expect(r?.actors.find((a) => a.role === 'giver')?.label).toBe('小熊');
    expect(r?.actors.find((a) => a.role === 'receiver')?.label).toBe('小兔');
  });

  it('把"一起抬桌子"识别成合作动作，两个角色都是帮手', () => {
    const r = derive('小熊搬桌子有点吃力，兔兔走过来一起抬桌子', { propIds: ['table'] });
    expect(r?.verb).toBe('lift-together');
    expect(r?.actors.map((a) => a.role)).toEqual(['helper', 'helper']);
    expect(r?.propId).toBe('table');
  });

  it('把对话气泡识别成说话，并取出角色真正说的台词', () => {
    const r = derive('小兔看着小熊，嘴巴旁出现对话气泡：可以借我玩吗？', { propIds: [] });
    expect(r?.verb).toBe('speak');
    expect(r?.actors.find((a) => a.role === 'speaker')?.label).toBe('小兔');
    expect(r?.speech).toBe('可以借我玩吗');
  });

  it('递东西时说"谢谢你"作为气泡台词保留下来', () => {
    const r = derive('小熊把饼干递给小兔，嘴巴旁出现“谢谢你”', { propIds: ['cookie'] });
    expect(r?.verb).toBe('handover');
    expect(r?.speech).toBe('谢谢你');
  });

  it('教学提问式提示语不会塞进角色气泡', () => {
    const r = derive('小熊把皮球递出去', { onScreenText: '小熊手里有什么？先问再借', propIds: ['ball'] });
    expect(r?.speech).toBeUndefined();
    const r2 = derive('小熊站在草地', { onScreenText: '找一找：皮球、饼干、滑梯', propIds: [] });
    expect(r2?.speech).toBeUndefined();
  });

  it('总结回顾场景不误判成角色动作（列举"一起抬桌子"只是在回顾）', () => {
    expect(
      derive('四个画面并排：借皮球、还玩具、一起抬桌子、说谢谢；今天我们一起回顾', {
        propIds: ['ball'],
      }),
    ).toBeNull();
  });

  it('没有角色或没有明确关系时返回 null，退回通用构图', () => {
    expect(derive('一片美丽的森林', { propIds: [] })).toBeNull();
  });

  // ---- 三维动作（slide / dribble）-------------------------------------------
  // 这两个动词是 3D 舞台的入口：命中就带 action3d，交给渲染层沿斜面滑行 /
  // 掌球接触。误判的代价很高（会强行把普通场景做成 3D），所以判定条件要窄。

  it('"小熊从滑梯上滑下来"识别成 slide，并带上三维动作描述', () => {
    const r = derive('小熊坐在滑梯顶端，顺着滑梯滑下来，稳稳落在草地上', { propIds: ['slide'] });
    expect(r?.verb).toBe('slide');
    expect(r?.propId).toBe('slide');
    expect(r?.action3d).toMatchObject({ motion: 'slide', renderer: '3d-procedural', actorId: 'bear' });
    expect(r?.actors).toHaveLength(1);
  });

  it('只爬上滑梯、没有下滑动作时不判成 slide，而是判成单人动作 climb', () => {
    // 这条曾经断言 null——那时 interaction 只描述"角色之间"的关系，
    // 单人位移没有归属字段，整幕只能落到 emoji 卡片。现在它归 climb。
    const r = derive('小熊爬上滑梯，扶着扶手站稳', { propIds: ['slide'] });
    expect(r).not.toBeNull();
    expect(r?.verb).toBe('climb');
    expect(r?.action3d).toBeUndefined();
    expect(r?.puppet).toMatchObject({ motion: 'climb', actorId: 'bear' });
  });

  it('"小熊走进公园"识别成 walk，且不会挂上三维动作', () => {
    const r = derive('小熊走进公园，看见前面有一座滑梯', { propIds: ['slide'] });
    expect(r?.verb).toBe('walk');
    expect(r?.action3d).toBeUndefined();
    expect(r?.puppet?.motion).toBe('walk');
  });

  it('"爬"没有向上语义时不算 climb（避免"爬行动物"这类名词误伤）', () => {
    const r = derive('乌龟是爬行动物，背上背着硬硬的壳', { propIds: [] });
    expect(r?.puppet).toBeUndefined();
  });

  it('"小熊拍皮球"识别成 dribble，道具固定为 ball', () => {
    const r = derive('小熊站在草地上拍皮球，球弹得高高的', { propIds: ['ball'] });
    expect(r?.verb).toBe('dribble');
    expect(r?.propId).toBe('ball');
    expect(r?.action3d).toMatchObject({ motion: 'dribble', actorId: 'bear' });
  });

  it('"拍手"这类同字不同义的句子不会误判成拍球', () => {
    expect(derive('小熊开心地拍拍手', { propIds: [] })).toBeNull();
  });
});

describe('normalizeSceneInteraction', () => {
  it('puppet 动作走白名单，未知 op 整份丢弃', () => {
    const ok = normalizeSceneInteraction({
      verb: 'climb',
      actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
      puppet: { motion: 'climb', actorId: 'bear', steps: 4 },
    });
    expect(ok?.puppet).toMatchObject({ motion: 'climb', steps: 4 });

    const bad = normalizeSceneInteraction({
      verb: 'climb',
      actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
      puppet: { motion: 'teleport', actorId: 'bear' },
    });
    // 未知动作被丢掉，但交互本身保留（退回 idle 入场，不是整幕空掉）
    expect(bad?.puppet).toBeUndefined();
    expect(bad?.verb).toBe('climb');
  });

  it('保留合法关系，丢弃多余与脏演员', () => {
    const r = normalizeSceneInteraction({
      verb: 'handover',
      actors: [
        { id: 'bear', label: '小熊', role: 'giver' },
        { id: 'rabbit', label: '小兔', role: 'receiver' },
        null,
      ],
      propId: 'BALL',
      speech: '给你',
    });
    expect(r?.verb).toBe('handover');
    expect(r?.actors).toHaveLength(2);
    expect(r?.propId).toBe('ball');
    expect(r?.speech).toBe('给你');
  });

  it('非法动词 / 空演员直接返回 null', () => {
    expect(normalizeSceneInteraction({ verb: 'teleport', actors: [{ id: 'bear', label: '小熊' }] })).toBeNull();
    expect(normalizeSceneInteraction({ verb: 'handover', actors: [] })).toBeNull();
  });

  it('透传合法的 action3d，并丢弃越界坐标（防止 NaN 进几何体）', () => {
    const ok = normalizeSceneInteraction({
      verb: 'slide',
      actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
      propId: 'slide',
      action3d: { motion: 'slide', actorId: 'BEAR', renderer: '3d-glb', start: [0, 3, 0], end: [4, 0, 0] },
    });
    expect(ok?.action3d).toMatchObject({
      motion: 'slide',
      actorId: 'bear',
      renderer: '3d-glb',
      start: [0, 3, 0],
      end: [4, 0, 0],
    });

    const dirty = normalizeSceneInteraction({
      verb: 'slide',
      actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
      action3d: { motion: 'slide', actorId: 'bear', start: [0, 9999, 0] },
    });
    expect(dirty?.action3d?.start).toBeUndefined();

    const badMotion = normalizeSceneInteraction({
      verb: 'slide',
      actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
      action3d: { motion: 'teleport', actorId: 'bear' },
    });
    expect(badMotion?.action3d).toBeUndefined();
  });
});

/**
 * 线上真实分镜的回归用例。
 *
 * 这些文案是接口实测产出的原样数据：visualDescription 走英文（生图提示词
 * 那一路）、narration 走中文。判据最初只写中文，结果 5 幕滑梯课整课降级成
 * 2D，且不报任何错。这组用例的作用就是让"静默降级"变成一次测试失败。
 */
describe('三维动作判据（中英双语）', () => {
  it('英文视觉描述 + 中文旁白：滑下来能命中 slide', () => {
    expect(
      hasThreeMotionCue(
        'The bear sits and slides down quickly with a happy open mouth, wind lines and sparkles around the slide, dynamic cartoon motion. 小熊坐好，脚朝前，双手放开，嗖的一下滑下来。',
      ),
    ).toBe('slide');
  });

  it('英文视觉描述 + 中文旁白：拍球能命中 dribble', () => {
    expect(
      hasThreeMotionCue(
        'The bear lands at the bottom, jumps up, catches a red ball, pats it bouncing up and down, smiling widely in a colorful park scene. 滑到底，小熊跳起来，抱起皮球，拍拍拍。',
      ),
    ).toBe('dribble');
  });

  it('只出现滑梯不出现下滑：不命中，避免"爬上滑梯"演成滑行', () => {
    expect(
      hasThreeMotionCue(
        'The cartoon bear carefully climbs the slide step by step, holding the rail with one hand. 小熊一步一步爬上滑梯，小手扶好。',
      ),
    ).toBeNull();
  });

  it('只出现球、没有拍/弹的动作：不命中', () => {
    expect(
      hasThreeMotionCue(
        'A cheerful cartoon bear walks into a sunny park, waving at a tall colorful slide and a round red ball. 小熊来到公园，看到高高的滑梯和圆圆的皮球。',
      ),
    ).toBeNull();
  });

  it('分镜推导走的也是同一套判据（视觉描述英文时不再降级成 2D）', () => {
    const r = derive(
      'The bear sits and slides down quickly, wind lines and sparkles around the slide.',
      { narration: '小熊坐好，嗖的一下滑下来。' },
    );
    expect(r?.verb).toBe('slide');
    expect(r?.action3d?.motion).toBe('slide');
  });
});

/**
 * 真实分镜回归：《小熊玩滑梯》课是线上第一份暴露"大头像 + 小图标"的样本，
 * 分镜原样存在 fixtures/slide-storyboard.json（从 agent 工具调用日志原样抠出，
 * 没有手工修饰）。它的关键在于第 2 幕完全没写 interaction——LLM 只写了
 * "扶栏杆、一步一步爬楼梯"的文字。若判定只能吃结构化字段，这一幕就必然掉回
 * 关系图卡片，而这正是用户看到的"小图标"。
 *
 * 所以这组用例锁的是路由决策本身，不是像素：
 *   第 2 幕的文字 → 必须自己长出 puppet.motion = 'climb'
 *   第 3、4 幕的显式字段 → 保持原来的 3D 动作，不被新加的 2D 判据抢走
 */
describe('真实分镜（小熊玩滑梯）的路由决策', () => {
  const storyboard = require('../fixtures/slide-storyboard.json') as {
    scenes: Array<{
      title: string;
      visualDescription: string;
      narration: string;
      onScreenText: string;
      interaction?: unknown;
    }>;
  };

  const route = (index: number) => {
    const scene = storyboard.scenes[index];
    // 与服务端 enrichPayloadWithStoryboard 里的推导顺序保持一致
    return (
      normalizeSceneInteraction(scene.interaction) ||
      deriveInteractionFromText({
        visualDescription: scene.visualDescription,
        narration: scene.narration,
        onScreenText: scene.onScreenText,
        mentions: findAnimalMentions(
          `${scene.visualDescription} ${scene.narration} ${scene.title}`,
        ),
        propIds: ['slide', 'ball'],
      })
    );
  };

  it('第 2 幕没写 interaction，但文字是"一步一步爬楼梯"→ 推出 puppet climb', () => {
    expect(storyboard.scenes[1].interaction).toBeUndefined();
    const r = route(1);
    expect(r?.puppet?.motion).toBe('climb');
    expect(r?.verb).toBe('climb');
    expect(r?.actors[0]?.label).toBe('小熊');
  });

  it('第 3、4 幕显式写的 slide / dribble 不被 2D 判据抢走', () => {
    expect(route(2)?.action3d?.motion).toBe('slide');
    expect(route(2)?.puppet).toBeUndefined();
    expect(route(3)?.action3d?.motion).toBe('dribble');
    expect(route(3)?.puppet).toBeUndefined();
  });

  it('第 5 幕是回顾（列举三个动作），不得被推成任何一个单人动作', () => {
    // 曾经这里只断言"没有 puppet"——太弱：它实际被"拍皮球"推成了 3D 拍球，
    // 回顾画面演成了单拍球动作。必须断言整份 interaction 为空。
    expect(route(4)).toBeNull();
  });
});

/**
 * 生成端能力表（P3 反向闭环）。
 *
 * 这一组钉的是"prompt 教了 LLM 什么，后端就必须接得住什么"。
 * 之前 prompt 的 verb 白名单只有七个旧动词，climb/walk 只能靠正则从旁白里捞，
 * 于是 LLM 永远学不会主动声明"这一幕在爬"。
 */
describe('LLM 直接声明单人动作（不再只靠正则兜底）', () => {
  const climbScene = {
    verb: 'climb',
    actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
    propId: 'slide',
  };

  it('verb=climb 能通过白名单校验（不再被当成未知动词整份丢弃）', () => {
    const r = normalizeSceneInteraction(climbScene);
    expect(r).not.toBeNull();
    expect(r?.verb).toBe('climb');
    expect(r?.propId).toBe('slide');
  });

  it('verb=walk 同样通过校验', () => {
    const r = normalizeSceneInteraction({
      verb: 'walk',
      actors: [{ id: 'rabbit', label: '小兔', role: 'helper' }],
    });
    expect(r?.verb).toBe('walk');
  });

  it('LLM 声明了 climb 就不该再带 puppet：verb 本身就是动作', () => {
    // 若模型自作主张塞了 puppet，也要被白名单校验拦住（motion 合法才留）。
    const clean = normalizeSceneInteraction(climbScene);
    expect(clean?.puppet).toBeUndefined();
    // 带合法 puppet 的仍保留（兼容老模型输出）
    const withPuppet = normalizeSceneInteraction({
      ...climbScene,
      puppet: { motion: 'climb', actorId: 'bear', steps: 4 },
    });
    expect(withPuppet?.puppet?.motion).toBe('climb');
    expect(withPuppet?.puppet?.steps).toBe(4);
  });

  it('hasAnyMotionCue 同时覆盖 3D 与 2D 线索，供降级告警判断', () => {
    expect(hasAnyMotionCue('小熊从滑梯上滑下来')).toBe('slide');
    expect(hasAnyMotionCue('小熊一步一步爬上去')).toBe('climb');
    expect(hasAnyMotionCue('小熊走过来看皮球')).toBe('walk');
    expect(hasAnyMotionCue('小熊安静地坐着')).toBeNull();
  });
});


/**
 * 演出契约（performance）：一幕多动作。
 *
 * 这组测试钉住的是"读契约"的边界，不是画面：模型写的顺序必须被保留、
 * 演员表必须能继承、演不了的动作必须被明确丢掉（而不是静默消失）。
 */
describe('normalizeScenePerformance', () => {
  const cast = [{ id: 'bear', label: '小熊', role: 'helper' }];

  it('读取有序动作表，并让后续动作继承 performance.actors', () => {
    const perf = normalizeScenePerformance({
      actors: cast,
      actions: [{ verb: 'walk' }, { verb: 'point', propId: 'slide' }, { verb: 'speak', speech: '看，这是滑梯' }],
    });
    expect(perf?.actions.map((a) => a.verb)).toEqual(['walk', 'point', 'speak']);
    // 继承到位：每个动作都带上了演员，渲染层不用再按 index 找
    expect(perf?.actions.every((a) => a.actors[0]?.id === 'bear')).toBe(true);
    expect(perf?.actions[1].propId).toBe('slide');
    expect(perf?.actions[2].speech).toBe('看，这是滑梯');
  });

  it('裸数组也收（模型偷懒时的常见形态）', () => {
    const perf = normalizeScenePerformance([
      { verb: 'walk', actors: cast },
      { verb: 'cheer', actors: cast },
    ]);
    expect(perf?.actions).toHaveLength(2);
  });

  it('动作不合法就丢掉那一个，其余保留', () => {
    const perf = normalizeScenePerformance({
      actors: cast,
      actions: [{ verb: 'walk' }, { verb: 'jump' }, { verb: 'point' }],
    });
    expect(perf?.actions.map((a) => a.verb)).toEqual(['walk', 'point']);
  });

  it('全部不合法 / 空表都返回 null，让上层回落而不是演半截', () => {
    expect(normalizeScenePerformance({ actors: cast, actions: [{ verb: 'jump' }] })).toBeNull();
    expect(normalizeScenePerformance({ actors: cast, actions: [] })).toBeNull();
    expect(normalizeScenePerformance(null)).toBeNull();
  });

  it('相邻重复动作去重：模型写两次 walk 只会让角色原地卡住', () => {
    const perf = normalizeScenePerformance({
      actors: cast,
      actions: [{ verb: 'walk' }, { verb: 'walk' }],
    });
    expect(perf?.actions).toHaveLength(1);
  });

  it('最多保留 3 个动作（再多就该拆幕，而不是挤在一个镜头里）', () => {
    const perf = normalizeScenePerformance({
      actors: cast,
      actions: [{ verb: 'walk' }, { verb: 'point' }, { verb: 'speak' }, { verb: 'cheer' }],
    });
    expect(perf?.actions).toHaveLength(3);
  });
});

describe('composePerformance', () => {
  const cast = [{ id: 'bear', label: '小熊', role: 'helper' }];
  const perf = (verbs: string[], extra: Array<Record<string, unknown>> = []) => ({
    actions: verbs.map((verb, i) => ({
      verb,
      actors: cast,
      ...(extra[i] || {}),
    })),
  }) as any;

  it('地面动作按顺序串起来，主动作是第一个', () => {
    const composed = composePerformance(perf(['walk', 'point', 'speak']));
    expect(composed.primary.verb).toBe('walk');
    expect(composed.motions).toEqual(['walk', 'point', 'speak']);
    expect(composed.dropped).toEqual([]);
  });

  it('有三维动作时以它为主：先走两步不是这一幕要演的东西', () => {
    const composed = composePerformance(perf(['walk', 'slide']));
    expect(composed.primary.verb).toBe('slide');
    expect(composed.motions).toEqual([]);
    expect(composed.dropped).toEqual(['walk']);
  });

  it('双人动作必须当主动作（单角色骨架演不了），其余丢掉并记录', () => {
    const composed = composePerformance(perf(['walk', 'handover']));
    expect(composed.primary.verb).toBe('handover');
    expect(composed.motions).toEqual([]);
    expect(composed.dropped).toEqual(['walk']);
  });

  it('攀爬是终态：它之后的动作被丢弃，但攀爬本身要留着', () => {
    const composed = composePerformance(perf(['climb', 'point']));
    expect(composed.motions).toEqual(['climb']);
    expect(composed.primary.verb).toBe('climb');
    expect(composed.dropped).toEqual(['point']);

    const walkThenClimb = composePerformance(perf(['walk', 'climb']));
    expect(walkThenClimb.motions).toEqual(['walk', 'climb']);
  });
});
