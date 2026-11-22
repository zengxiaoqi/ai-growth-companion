/**
 * 角色交互语法层的契约测试。
 *
 * 这一层负责把"小熊把皮球递给小兔""一起抬桌子""气泡：可以借我玩吗"
 * 这类文案里的关系变成结构化动作，让画面演出关系而不是只摆出角色。
 * 必须钉住：关系提取正确、说话者不是第一提及者时不搞反、
 * 总结场景和教学提问语不被误判成角色动作/台词。
 */

import {
  deriveInteractionFromText,
  normalizeSceneInteraction,
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

  it('只爬上滑梯、没有下滑动作时不判成 slide', () => {
    expect(derive('小熊爬上滑梯，扶着扶手站稳', { propIds: ['slide'] })).toBeNull();
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
