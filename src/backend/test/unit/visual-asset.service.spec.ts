import { VisualAssetService } from '../../src/modules/learning/visual-asset.service';

describe('VisualAssetService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
});
