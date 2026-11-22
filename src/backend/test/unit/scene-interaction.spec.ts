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
});
