import { VisualAssetService } from '../../src/modules/learning/visual-asset.service';

describe('VisualAssetService', () => {
  // 这里的用例只覆盖「本地课程素材 → 外部素材」这条解析顺序。
  // 矢量库是可选 provision（`npm run assets:vector` 下载的 manifest.json
  // 被 gitignore），装了它角色会优先命中矢量库，provider/role/staticPath
  // 全变——同一份代码在两台机器上一红一绿。所以这里显式摘掉矢量库，
  // 让用例与本机装没装它无关。
  beforeEach(() => {
    jest
      .spyOn(VisualAssetService.prototype as any, 'resolveVectorAsset')
      .mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inlines the local snail variant for props even when generation is disabled', async () => {
    const service = new VisualAssetService();
    const svg = await service.loadPropSvg('蜗牛');

    expect(svg?.canvas).toBeGreaterThan(0);
    expect(svg?.markup).toContain('<');
    expect(svg?.markup).not.toContain('<svg');
  });

  it('resolves local CC0 tiger assets before external providers', async () => {
    const fetchSpy = jest
      .spyOn(global as any, 'fetch')
      .mockRejectedValue(new Error('network should not be used'));
    const service = new VisualAssetService();

    const plan = await service.resolveSceneVisualAssets(
      {
        title: 'tiger stripes',
        assetKey: 'tiger',
        assetTags: ['tiger', 'stripe', 'forest'],
        action: 'showFeatures',
        habitat: 'forest',
      },
      'tiger lesson',
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(plan.mainCharacter).toMatchObject({
      provider: 'local',
      role: 'tiger-standing',
      license: 'cc0',
      staticPath: 'assets/lesson/animals/tiger-standing.svg',
    });
    expect(plan.background).toMatchObject({
      provider: 'local',
      role: 'forest-day',
    });
  });

  it('resolves rabbit character assets instead of reporting only a local background hit', async () => {
    const fetchSpy = jest
      .spyOn(global as any, 'fetch')
      .mockRejectedValue(new Error('network should not be used'));
    const service = new VisualAssetService();

    const plan = await service.resolveSceneVisualAssets(
      {
        title: '兔子的长耳朵',
        narration: '兔子有长长的耳朵，喜欢在草地上蹦蹦跳跳。',
        assetKey: 'rabbit',
        assetTags: ['rabbit', 'long-ears', 'grassland'],
        action: 'listen',
        habitat: 'grassland',
      },
      '认识动物兔子',
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(plan.sourceProvider).toBe('local');
    expect(plan.mainCharacter).toMatchObject({
      provider: 'local',
      role: 'rabbit-listening',
      staticPath: 'assets/lesson/animals/rabbit-listening.svg',
    });
    expect(plan.background).toMatchObject({
      provider: 'local',
      role: 'grassland',
    });
  });

  it('caches an Openverse CC0 asset when no local asset matches', async () => {
    const imageBuffer = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
        <rect width="640" height="480" fill="#f5f5f5"/>
        ${Array.from({ length: 40 })
          .map(
            (_, index) =>
              `<circle cx="${20 + index * 14}" cy="${80 + (index % 12) * 20}" r="8" fill="#222"/>`,
          )
          .join('')}
      </svg>`,
    );
    jest.spyOn(global as any, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('openverse')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'asset-1',
                url: 'https://example.test/panda.svg',
                foreign_landing_url: 'https://example.test/panda',
                license: 'cc0',
                license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
                creator: 'Open artist',
                mature: false,
                width: 640,
                height: 480,
              },
            ],
          }),
        } as any;
      }
      return {
        ok: true,
        headers: { get: () => 'image/svg+xml' },
        arrayBuffer: async () =>
          imageBuffer.buffer.slice(
            imageBuffer.byteOffset,
            imageBuffer.byteOffset + imageBuffer.byteLength,
          ),
      } as any;
    });

    const service = new VisualAssetService();
    const asset = await (service as any).resolveAsset({
      kind: 'character',
      role: 'panda-standing-test',
      query: 'panda standing cc0',
      tags: ['panda'],
      minWidth: 512,
      minHeight: 360,
    });

    expect(asset).toMatchObject({
      provider: 'openverse',
      role: 'panda-standing-test',
      license: 'cc0',
    });
    expect(asset.staticPath).toMatch(/^\.generated\/assets\//);
  });

  it('returns null gracefully when Openverse download throws TypeError (network failure)', async () => {
    jest.spyOn(global as any, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('openverse')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'asset-net-fail',
                url: 'https://example.test/unreachable.png',
                foreign_landing_url: 'https://example.test/unreachable',
                license: 'cc0',
                license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
                creator: 'Test',
                mature: false,
                width: 800,
                height: 600,
              },
            ],
          }),
        } as any;
      }
      // Simulate Node.js fetch TypeError on network failure
      throw new TypeError('fetch failed');
    });

    const service = new VisualAssetService();
    const asset = await (service as any).resolveAsset({
      kind: 'character',
      role: 'test-net-fail',
      query: 'test network failure',
      tags: ['test'],
      minWidth: 256,
      minHeight: 200,
    });

    // Should return null instead of throwing TypeError
    expect(asset).toBeNull();
  });

  it('returns null gracefully when wikimedia download throws TypeError', async () => {
    jest.spyOn(global as any, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('wikimedia')) {
        return {
          ok: true,
          json: async () => ({
            query: {
              pages: {
                '1': {
                  imageinfo: [
                    {
                      url: 'https://example.test/wiki-image.jpg',
                      mime: 'image/jpeg',
                      width: 1600,
                      height: 900,
                      extmetadata: {
                        LicenseShortName: { value: 'CC0' },
                      },
                    },
                  ],
                },
              },
            },
          }),
        } as any;
      }
      // Simulate network TypeError
      throw new TypeError('fetch failed');
    });

    const service = new VisualAssetService();
    const asset = await (service as any).resolveAsset({
      kind: 'background',
      role: 'test-wiki-fail',
      query: 'test wiki failure',
      tags: ['test'],
      minWidth: 256,
      minHeight: 200,
    });

    expect(asset).toBeNull();
  });

  it('handles fetch TypeError with cause property gracefully', async () => {
    const typeError = new TypeError('fetch failed');
    (typeError as any).cause = new Error('ECONNREFUSED 127.0.0.1:443');

    jest.spyOn(global as any, 'fetch').mockRejectedValue(typeError);

    const service = new VisualAssetService();
    // Should not throw - all providers fail gracefully
    const plan = await service.resolveSceneVisualAssets(
      {
        title: 'test',
        assetTags: ['test'],
        action: 'explore',
        habitat: 'forest',
      },
      'test topic',
    );

    expect(plan).toBeDefined();
    // When all network providers fail, the service falls back to local assets
    // or svgFallback. Either is acceptable — the key assertion is no throw.
    expect(['local', 'svgFallback']).toContain(plan.sourceProvider);
  });

  it('rejects non-CC0 and undersized external assets', async () => {
    jest.spyOn(global as any, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('openverse')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                url: 'https://example.test/small.jpg',
                license: 'cc-by-sa',
                mature: false,
                width: 120,
                height: 90,
              },
            ],
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: {
              '1': {
                imageinfo: [
                  {
                    url: 'https://example.test/by.jpg',
                    mime: 'image/jpeg',
                    width: 1600,
                    height: 900,
                    extmetadata: {
                      LicenseShortName: { value: 'CC BY-SA 4.0' },
                    },
                  },
                ],
              },
            },
          },
        }),
      } as any;
    });

    const service = new VisualAssetService();
    const asset = await (service as any).resolveAsset({
      kind: 'character',
      role: 'lion-standing-test',
      query: 'lion standing',
      tags: ['lion'],
      minWidth: 512,
      minHeight: 360,
    });

    expect(asset).toBeNull();
  });

  it('selects explicit snail appearance assets before fuzzy vector aliases', async () => {
    const fetchSpy = jest
      .spyOn(global as any, 'fetch')
      .mockRejectedValue(new Error('network should not be used'));
    const service = new VisualAssetService();

    const plan = await service.resolveSceneVisualAssets(
      {
        title: '保护自己',
        narration: '蜗牛把身体缩进壳里，只露出壳保护自己。',
        visualDescription: 'a retracted snail hiding inside its shell',
        assetKey: 'snail',
        assetTags: ['snail', 'shell', 'garden'],
        action: 'rest',
        habitat: 'garden',
      },
      '蜗牛壳上的花纹',
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(plan.mainCharacter).toMatchObject({
      provider: 'local',
      license: 'cc0',
      staticPath: 'assets/lesson/animals/snail-retracted.svg',
    });
  });

  it('uses distinct teaching assets for snail summary concepts', async () => {
    const service = new VisualAssetService();
    const icons = await service.resolveGraphIcons(
      {
        relation: 'cycle',
        nodes: [
          { id: 'walk', label: '背着壳爬', subject: '蜗牛', role: 'subject' },
          { id: 'grow', label: '壳口长大', subject: '蜗牛壳', role: 'object' },
          { id: 'pattern', label: '螺旋花纹', subject: '蜗牛壳', role: 'object' },
          { id: 'rest', label: '缩进壳里', subject: '蜗牛壳', role: 'place' },
        ],
      },
      '蜗牛壳上的花纹',
      '蜗牛背着壳爬，爬累了就缩进壳里休息。',
    );

    expect(icons).toEqual({
      walk: 'assets/lesson/animals/snail-generic.svg',
      grow: 'assets/lesson/animals/snail-shell-growth.svg',
      pattern: 'assets/lesson/animals/snail-shell-pattern.svg',
      rest: 'assets/lesson/animals/snail-retracted.svg',
    });
    expect(new Set(Object.values(icons)).size).toBe(4);
  });

  it('uses a spiral bud and ridged horn for the comparison practice', async () => {
    const service = new VisualAssetService();
    const icons = await service.resolveGraphIcons(
      {
        relation: 'group',
        nodes: [
          { id: 'shell', label: '蜗牛壳', subject: '蜗牛壳', role: 'object' },
          { id: 'horn', label: '羊角', subject: '羊角', role: 'object' },
          { id: 'bud', label: '牵牛花', subject: '牵牛花', role: 'object' },
        ],
      },
      '蜗牛壳上的花纹',
      '弯弯的羊角有螺旋，牵牛花的花苞也有螺旋。',
    );

    expect(icons.horn).toBe('assets/lesson/objects/ram-horn-spiral.svg');
    expect(icons.bud).toBe('assets/lesson/objects/morning-glory-bud.svg');
  });

  it('resolves shell-only concept labels without requiring an animal word in the node', async () => {
    const service = new VisualAssetService();
    const icons = await service.resolveGraphIcons(
      {
        relation: 'group',
        nodes: [
          { id: 'grow', label: '壳口长大', subject: '壳口', role: 'object' },
          { id: 'pattern', label: '螺旋花纹', subject: '壳纹', role: 'object' },
        ],
      },
      '蜗牛壳上的花纹',
    );

    expect(icons).toEqual({
      grow: 'assets/lesson/animals/snail-shell-growth.svg',
      pattern: 'assets/lesson/animals/snail-shell-pattern.svg',
    });
  });

  it('keeps an explicitly open morning glory separate from a bud in mixed context', () => {
    const service = new VisualAssetService() as any;
    const context = '牵牛花的花苞卷曲，盛开的牵牛花开放。';

    expect(
      service.resolveNodeTeachingAsset({ label: '花苞', subject: '牵牛花' }, context),
    ).toBe('assets/lesson/objects/morning-glory-bud.svg');
    expect(
      service.resolveNodeTeachingAsset({ label: '盛开的牵牛花', subject: '牵牛花' }, context),
    ).toBeNull();
  });

  it('resolves comparison graph nodes to distinct white and striped snails', async () => {
    const service = new VisualAssetService();
    const icons = await service.resolveGraphIcons(
      {
        relation: 'compare',
        nodes: [
          { id: 'white', label: '白玉蜗牛', subject: '白玉蜗牛', role: 'subject' },
          { id: 'striped', label: '花蜗牛', subject: '花蜗牛', role: 'subject' },
        ],
      },
      '蜗牛壳上的花纹',
    );

    expect(icons).toEqual({
      white: 'assets/lesson/animals/snail-white.svg',
      striped: 'assets/lesson/animals/snail-striped.svg',
    });
  });
});
