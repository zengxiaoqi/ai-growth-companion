import { WebSearchService } from '../../src/modules/web-search/web-search.service';
import { Logger } from '@nestjs/common';

jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

function makeService(env: Record<string, string>): WebSearchService {
  const config = {
    get: (key: string, fallback?: any) => env[key] ?? fallback,
  } as any;
  return new WebSearchService(config);
}

const originalFetch = global.fetch;

describe('WebSearchService', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('stays disabled when no provider is configured', async () => {
    const service = makeService({});
    expect(service.isEnabled).toBe(false);
    await expect(service.search('彩虹')).rejects.toThrow('WEB_SEARCH_DISABLED');
  });

  it('parses Tavily results, strips markup, and caches repeats', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: '<b>彩虹</b>是怎么形成的',
            url: 'https://example.com/rainbow',
            content: '<p>阳光穿过雨滴时发生折射。</p>',
            published_date: '2025-03-01',
          },
          { title: 'ftp result', url: 'ftp://example.com/x', content: 'skip me' },
        ],
      }),
    });
    global.fetch = fetchMock as any;

    const service = makeService({
      WEB_SEARCH_PROVIDER: 'tavily',
      WEB_SEARCH_API_KEY: 'test-key',
    });

    const first = await service.search('彩虹 儿童科普');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      title: '彩虹是怎么形成的',
      url: 'https://example.com/rainbow',
      snippet: '阳光穿过雨滴时发生折射。',
      site: 'example.com',
    });

    const second = await service.search('彩虹 儿童科普');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.tavily.com/search');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
  });

  it('parses Bocha webPages payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        data: {
          webPages: {
            value: [
              {
                name: '故宫博物院简介',
                url: 'https://www.dpm.org.cn/overview',
                summary: '故宫又称紫禁城，是明清两代的皇家宫殿。',
                siteName: '故宫博物院',
                datePublished: '2024-01-01',
              },
            ],
          },
        },
      }),
    });
    global.fetch = fetchMock as any;

    const service = makeService({
      WEB_SEARCH_PROVIDER: 'bocha',
      WEB_SEARCH_API_KEY: 'bocha-key',
    });

    const results = await service.search('故宫 建筑');
    expect(results[0]).toMatchObject({
      title: '故宫博物院简介',
      site: '故宫博物院',
      snippet: '故宫又称紫禁城，是明清两代的皇家宫殿。',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.bochaai.com/v1/web-search');
  });

  it('queries a SearXNG instance with strict safe search', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: '大熊猫为什么会吃竹子',
            url: 'https://example.org/panda',
            content: '大熊猫属于食肉目，但主要食物是竹子。',
          },
        ],
      }),
    });
    global.fetch = fetchMock as any;

    const service = makeService({
      WEB_SEARCH_PROVIDER: 'searxng',
      WEB_SEARCH_BASE_URL: 'https://search.example.com/',
    });

    const results = await service.search('熊猫 科普');
    expect(results).toHaveLength(1);
    const calledUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://search.example.com/search');
    expect(calledUrl.searchParams.get('format')).toBe('json');
    expect(calledUrl.searchParams.get('safesearch')).toBe('2');
  });

  it('reports timeouts as a dedicated error', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    ) as any;

    const service = makeService({
      WEB_SEARCH_PROVIDER: 'tavily',
      WEB_SEARCH_API_KEY: 'test-key',
      WEB_SEARCH_TIMEOUT_MS: '1000',
    });

    await expect(service.search('故宫')).rejects.toThrow('WEB_SEARCH_TIMEOUT');
  });
});
