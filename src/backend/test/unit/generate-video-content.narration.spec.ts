/**
 * 分镜生成的「旁白 ↔ 画面节点」闭环测试。
 *
 * 钉住两件事，都是实测逼出来的：
 * 1) 首轮有节点没被旁白念到，必须带话术重试（否则模型不知道自己错了）；
 * 2) 重试是"整份重掷"而不是定点修补——实测有样本从缺 2 个变成缺 6 个，
 *    所以必须留缺口最少的那份，不能让更差的覆盖更好的。
 */

import { GenerateVideoContentTool } from '../../src/agent-framework/tools/impl/generate-video-content';
import type { VideoStoryboard } from '../../src/agent-framework/tools/impl/generate-video-content';

type SceneSpec = { narration: string; nodes: string[] };

/** 造一份合法分镜 JSON（≥3 场景，chain 图每屏 2-3 个节点） */
function storyboardJson(tag: string, scenes: SceneSpec[]): string {
  return JSON.stringify({
    title: '测试课',
    visualTheme: {},
    scenes: scenes.map((s, i) => ({
      id: `scene-${i + 1}`,
      title: `${tag}${i + 1}`,
      narration: s.narration,
      sceneGraph: {
        relation: 'chain',
        nodes: s.nodes.map((label, j) => ({ id: `n${j + 1}`, label, subject: label, role: 'object' })),
      },
    })),
  });
}

/** 三屏都干净：每个节点都被念到 */
const CLEAN: SceneSpec[] = [
  { narration: '青草被兔子吃掉。', nodes: ['青草', '兔子'] },
  { narration: '兔子被狐狸盯上。', nodes: ['兔子', '狐狸'] },
  { narration: '兔子和狐狸排成一条链子。', nodes: ['兔子', '狐狸'] },
];

/** 一屏有节点没被念到（「白云」旁白里没有） */
const ONE_MISS: SceneSpec[] = [
  { narration: '水汽飞到天上。', nodes: ['水汽', '白云'] },
  { narration: '兔子被狐狸盯上。', nodes: ['兔子', '狐狸'] },
  { narration: '兔子和狐狸排成一条链子。', nodes: ['兔子', '狐狸'] },
];

/** 三屏全都缺（旁白只剩一个词） */
const MANY_MISS: SceneSpec[] = [
  { narration: '水汽飞到天上。', nodes: ['水汽', '白云'] },
  { narration: '兔子被狐狸盯上。', nodes: ['兔子', '乌云'] },
  { narration: '它们排成一条链子。', nodes: ['兔子', '闪电'] },
];

function makeTool(responses: string[]) {
  let calls = 0;
  const llm = {
    authorModel: 'fake',
    generate: jest.fn(async () => responses[Math.min(calls++, responses.length - 1)]),
  };
  const tool = new GenerateVideoContentTool(llm as any);
  return { tool, llm };
}

describe('generateVideoContent · 画面节点必须被旁白念到', () => {
  it('首轮就干净时只调一次模型，不重试', async () => {
    const { tool, llm } = makeTool([storyboardJson('A', CLEAN), storyboardJson('B', MANY_MISS)]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(result.success).toBe(true);
    expect(llm.generate).toHaveBeenCalledTimes(1);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('A1');
  });

  it('首轮有缺口会带话术重试，第二轮干净的胜出', async () => {
    const { tool, llm } = makeTool([storyboardJson('A', ONE_MISS), storyboardJson('B', CLEAN)]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(llm.generate).toHaveBeenCalledTimes(2);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('B1');
    // 第二轮提示词里必须带上第一轮的具体缺失，否则模型只会原样再交一遍
    const secondPrompt = String((llm.generate as jest.Mock).mock.calls[1][0]);
    expect(secondPrompt).toContain('Previous issues');
    expect(secondPrompt).toContain('白云');
  });

  it('重试掷得更差时保留首轮，不让更差的覆盖更好的', async () => {
    const { tool, llm } = makeTool([storyboardJson('A', ONE_MISS), storyboardJson('B', MANY_MISS)]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(llm.generate).toHaveBeenCalledTimes(3); // 用尽重试次数
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('A1');
  });
});
