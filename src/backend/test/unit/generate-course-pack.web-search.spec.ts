import { GenerateCoursePackTool } from '../../src/modules/ai/agent/tools/generate-course-pack';
import { Logger } from '@nestjs/common';

jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

const minimalPack = JSON.stringify({
  title: '故宫小课堂',
  summary: '认识故宫的建筑和故事。',
  outcomes: ['说出故宫的位置', '认识屋顶形状', '讲一个故宫小故事'],
});

function makeWebSearch(overrides: Record<string, any> = {}) {
  return {
    isEnabled: true,
    provider: 'tavily',
    courseMode: 'auto',
    search: jest.fn().mockResolvedValue([
      {
        title: '故宫博物院简介',
        url: 'https://www.dpm.org.cn/overview',
        snippet: '故宫又称紫禁城，是明清两代的皇家宫殿。',
        site: '故宫博物院',
      },
    ]),
    ...overrides,
  };
}

describe('GenerateCoursePackTool web research', () => {
  let llmClient: { generateJson: jest.Mock };
  let generateActivityTool: { execute: jest.Mock };

  beforeEach(() => {
    llmClient = { generateJson: jest.fn().mockResolvedValue(minimalPack) };
    generateActivityTool = { execute: jest.fn() };
  });

  it('injects research notes into the prompt and records sources', async () => {
    const webSearch = makeWebSearch();
    const tool = new GenerateCoursePackTool(
      llmClient as any,
      generateActivityTool as any,
      webSearch as any,
    );

    const raw = await tool.execute({
      topic: '故宫',
      ageGroup: '5-6',
      domain: 'social',
      parentPrompt: '给五岁的孩子讲讲故宫的建筑特点和小故事',
      includeGame: false,
      includeVideo: false,
      includeAudio: false,
    });

    const pack = JSON.parse(raw);
    const prompt = llmClient.generateJson.mock.calls[0][0] as string;
    expect(webSearch.search).toHaveBeenCalledWith('故宫 幼儿社交 习惯培养', { maxResults: 5 });
    expect(prompt).toContain('Web research notes');
    expect(prompt).toContain('故宫博物院简介');
    expect(pack.research).toMatchObject({
      query: '故宫 幼儿社交 习惯培养',
      provider: 'tavily',
      sources: [
        { title: '故宫博物院简介', url: 'https://www.dpm.org.cn/overview', site: '故宫博物院' },
      ],
    });
  });

  it('skips the lookup when the request forbids it', async () => {
    const webSearch = makeWebSearch();
    const tool = new GenerateCoursePackTool(
      llmClient as any,
      generateActivityTool as any,
      webSearch as any,
    );

    const raw = await tool.execute({
      topic: '故宫',
      ageGroup: '5-6',
      domain: 'social',
      parentPrompt: '给五岁的孩子讲讲故宫的建筑特点和小故事',
      includeGame: false,
      includeVideo: false,
      includeAudio: false,
      useWebSearch: 'off',
    });

    expect(webSearch.search).not.toHaveBeenCalled();
    expect(JSON.parse(raw).research).toBeUndefined();
  });

  it('keeps generating when the search fails', async () => {
    const webSearch = makeWebSearch({
      search: jest.fn().mockRejectedValue(new Error('upstream 500')),
    });
    const tool = new GenerateCoursePackTool(
      llmClient as any,
      generateActivityTool as any,
      webSearch as any,
    );

    const raw = await tool.execute({
      topic: '恐龙',
      ageGroup: '5-6',
      domain: 'science',
      includeGame: false,
      includeVideo: false,
      includeAudio: false,
    });

    const pack = JSON.parse(raw);
    expect(pack.title).toBe('故宫小课堂');
    expect(pack.research).toBeUndefined();
    expect(llmClient.generateJson).toHaveBeenCalledTimes(1);
  });
});
