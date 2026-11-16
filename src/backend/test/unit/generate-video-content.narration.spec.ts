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
function storyboardJson(tag: string, scenes: SceneSpec[], relation = 'chain'): string {
  return JSON.stringify({
    title: '测试课',
    visualTheme: {},
    scenes: scenes.map((s, i) => ({
      id: `scene-${i + 1}`,
      title: `${tag}${i + 1}`,
      narration: s.narration,
      sceneGraph: {
        relation,
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

  it('两份都是"1 个场景有问题"时，留缺节点更少的那份', async () => {
    // 留优曾经按"有问题的场景数"比：两份都只有 1 个场景出问题就判平，
    // 于是保留先到的那份——哪怕它一屏缺 3 个节点、后一份只缺 1 个。
    // 按节点数比才分得出高低。
    const missThree: SceneSpec[] = [
      { narration: '水汽飞到天上。', nodes: ['水汽', '白云', '彩虹', '闪电'] },
      { narration: '兔子被狐狸盯上。', nodes: ['兔子', '狐狸'] },
      { narration: '兔子和狐狸排成一条链子。', nodes: ['兔子', '狐狸'] },
    ];
    const missOne: SceneSpec[] = [
      { narration: '水汽飞到天上。', nodes: ['水汽', '白云'] },
      { narration: '兔子被狐狸盯上。', nodes: ['兔子', '狐狸'] },
      { narration: '兔子和狐狸排成一条链子。', nodes: ['兔子', '狐狸'] },
    ];
    const { tool } = makeTool([
      storyboardJson('A', missThree),
      storyboardJson('B', missOne),
      storyboardJson('C', missOne),
    ]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('B1');
  });
});

/**
 * 一屏塞太多概念：覆盖率审计对这一档是失明的。
 *
 * group 一屏 9 个节点（三组颜色 × 三个水果）时，每个名字都被念到了——覆盖率 100%，
 * 首轮就能"通过"。但旁白只能是「苹果和草莓是红色的，香蕉和柠檬是黄色的，葡萄和蓝莓
 * 是紫色的」，六个名字挤在一屏里，孩子抓不住任何一个，卡片也来不及逐个点亮。
 * 所以密度必须单独进重试条件，否则这类分镜永远是首轮即放行。
 */
describe('generateVideoContent · 一屏不要塞太多概念', () => {
  /** 6 个节点全被念到：覆盖没问题，只是挤 */
  const CROWDED: SceneSpec[] = [
    {
      narration: '苹果、草莓、香蕉、柠檬、葡萄和蓝莓都是水果。',
      nodes: ['水果', '苹果', '草莓', '香蕉', '柠檬', '葡萄'],
    },
    { narration: '兔子被狐狸盯上。', nodes: ['兔子', '狐狸'] },
    { narration: '兔子和狐狸排成一条链子。', nodes: ['兔子', '狐狸'] },
  ];

  it('覆盖满分但一屏 6 个节点，仍要重试', async () => {
    const { tool, llm } = makeTool([
      storyboardJson('A', CROWDED, 'group'),
      storyboardJson('B', CLEAN),
    ]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(llm.generate).toHaveBeenCalledTimes(2);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('B1');
  });

  it('回喂话术要说"拆成两屏"，不能只说"节点太多"', async () => {
    const { tool, llm } = makeTool([
      storyboardJson('A', CROWDED, 'group'),
      storyboardJson('B', CLEAN),
    ]);
    await tool.execute({ topic: '测试' } as any, {} as any);
    const secondPrompt = String((llm.generate as jest.Mock).mock.calls[1][0]);
    expect(secondPrompt).toContain('拆成两屏');
    expect(secondPrompt).toContain('不要靠删节点');
  });

  it('5 个节点（类别 + 4 个成员）是上限，不触发重试', async () => {
    const ok: SceneSpec[] = [
      {
        narration: '苹果、香蕉、葡萄和草莓都是水果。',
        nodes: ['水果', '苹果', '香蕉', '葡萄', '草莓'],
      },
      { narration: '兔子被狐狸盯上。', nodes: ['兔子', '狐狸'] },
      { narration: '兔子和狐狸排成一条链子。', nodes: ['兔子', '狐狸'] },
    ];
    const { tool, llm } = makeTool([storyboardJson('A', ok, 'group')]);
    await tool.execute({ topic: '测试' } as any, {} as any);
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });
});
