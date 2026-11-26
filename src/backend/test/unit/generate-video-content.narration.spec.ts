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
        nodes: s.nodes.map((label, j) => ({
          id: `n${j + 1}`,
          label,
          subject: label,
          role: 'object',
        })),
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
  // 工具现在走 generateStreaming（流式累积），两条路共用一个 mock：
  // 断言看的是"发了几次请求、每次的 prompt"，与底层是流式还是整包无关。
  const generate = jest.fn(async () => responses[Math.min(calls++, responses.length - 1)]);
  const llm = {
    authorModel: 'fake',
    generate,
    generateStreaming: generate,
  };
  const tool = new GenerateVideoContentTool(llm as any);
  return { tool, llm };
}

describe('generateVideoContent · 画面节点必须被旁白念到', () => {
  it('首轮就干净时只调一次模型，不重试', async () => {
    const { tool, llm } = makeTool([storyboardJson('A', CLEAN), storyboardJson('B', MANY_MISS)]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(result.success).toBe(true);
    expect(llm.generateStreaming).toHaveBeenCalledTimes(1);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('A1');
  });

  it('首轮有缺口会带话术重试，第二轮干净的胜出', async () => {
    const { tool, llm } = makeTool([storyboardJson('A', ONE_MISS), storyboardJson('B', CLEAN)]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(llm.generateStreaming).toHaveBeenCalledTimes(2);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('B1');
    // 第二轮提示词里必须带上第一轮的具体缺失，否则模型只会原样再交一遍
    const secondPrompt = String((llm.generateStreaming as jest.Mock).mock.calls[1][0]);
    expect(secondPrompt).toContain('Previous issues');
    expect(secondPrompt).toContain('白云');
  });

  it('重试掷得更差时保留首轮，不让更差的覆盖更好的', async () => {
    const { tool, llm } = makeTool([storyboardJson('A', ONE_MISS), storyboardJson('B', MANY_MISS)]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(llm.generateStreaming).toHaveBeenCalledTimes(3); // 用尽重试次数
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
    expect(llm.generateStreaming).toHaveBeenCalledTimes(2);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('B1');
  });

  it('回喂话术要说"拆成两屏"，不能只说"节点太多"', async () => {
    const { tool, llm } = makeTool([
      storyboardJson('A', CROWDED, 'group'),
      storyboardJson('B', CLEAN),
    ]);
    await tool.execute({ topic: '测试' } as any, {} as any);
    const secondPrompt = String((llm.generateStreaming as jest.Mock).mock.calls[1][0]);
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
    expect(llm.generateStreaming).toHaveBeenCalledTimes(1);
  });
});

describe('generateVideoContent · 蜗牛科学事实门禁', () => {
  it('高风险分镜必须重试，并把蜗牛壳事实约束写进后续提示词', async () => {
    const safe: SceneSpec[] = [
      { narration: '蜗牛壳在壳口边缘逐渐形成，新的壳从壳口长出来。', nodes: ['壳口', '新的壳'] },
      { narration: '蜗牛壳上的花纹各不相同，不能用来判断年龄。', nodes: ['花纹', '年龄'] },
      { narration: '蜗牛壳能提供一定保护，但小鸟仍可能啄它。', nodes: ['蜗牛壳', '小鸟'] },
    ];
    const { tool, llm } = makeTool([
      storyboardJson('错误', [
        { narration: '蜗牛长一岁多一圈，花纹越多说明越老。', nodes: ['蜗牛', '花纹'] },
        ...safe.slice(1),
      ]),
      storyboardJson('正确', safe),
    ]);

    const result = await tool.execute(
      { topic: '蜗牛壳上的花纹', domain: 'science' } as any,
      {} as any,
    );

    expect(result.success).toBe(true);
    expect((result.data as VideoStoryboard).scenes[0].title).toBe('正确1');
    const firstPrompt = String((llm.generateStreaming as jest.Mock).mock.calls[0][0]);
    const secondPrompt = String((llm.generateStreaming as jest.Mock).mock.calls[1][0]);
    expect(llm.generateStreaming).toHaveBeenCalledTimes(2);
    expect(firstPrompt).toContain('蜗牛壳不是年轮');
    expect(firstPrompt).toContain('壳口边缘逐渐形成');
    expect(secondPrompt).toContain('science fact gate failed');
  });
});

/**
 * 道具声明必须穿过分镜工具的 sanitize 白名单。
 *
 * 提示词说"先声明、再引用"没有用：LLM 输出里的 props 如果在这里被抹掉，
 * 后面的 normalizeDeclaredProps / prop-resolver / carry 全部拿不到输入，
 * 成片里角色空着手，而且没有任何一条日志会报错。
 */
describe('generateVideoContent · props 白名单', () => {
  it('LLM 写出的 props 原样进入 storyboard，非法项与超量项被挡掉', async () => {
    const raw = JSON.stringify({
      title: '道具课',
      visualTheme: {},
      scenes: CLEAN.map((s, i) => ({
        id: `scene-${i + 1}`,
        title: `A${i + 1}`,
        narration: s.narration,
        sceneGraph: {
          relation: 'chain',
          nodes: s.nodes.map((label, j) => ({
            id: `n${j + 1}`,
            label,
            subject: label,
            role: 'object',
          })),
        },
        ...(i === 0
          ? {
              props: [
                { name: '洒水壶', place: 'hand', heightRatio: 0.22 },
                'not-an-object',
                { name: '水桶', place: 'floor' },
                { name: '第四个', place: 'floor' },
                { name: '第五个', place: 'floor' },
              ],
            }
          : {}),
      })),
    });
    const { tool } = makeTool([raw]);
    const result = await tool.execute({ topic: '测试' } as any, {} as any);
    expect(result.success).toBe(true);
    const scenes = (result.data as VideoStoryboard).scenes;
    // 4 个对象里只留前 3 个（与 prop-contract 的 MAX_PROPS_PER_SCENE 一致），
    // 字符串项在形状过滤时就被丢掉。
    expect(scenes[0].props).toEqual([
      { name: '洒水壶', place: 'hand', heightRatio: 0.22 },
      { name: '水桶', place: 'floor' },
      { name: '第四个', place: 'floor' },
    ]);
    expect(scenes[1].props).toBeUndefined();
  });
});
