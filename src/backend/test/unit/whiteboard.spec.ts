import {
  parseWhiteboardConfig,
  readRasterDimensions,
  resolveWhiteboardTiming,
  type WhiteboardConfig,
} from '../../src/modules/learning/whiteboard';
import { ANIMATION_TEMPLATES, KNOWN_TEMPLATE_IDS } from '../../src/animations/animation-templates';

const validConfig = (): WhiteboardConfig => ({
  sourceImage: 'whiteboard/shapes.png',
  canvas: { width: 800, height: 450 },
  regions: [
    {
      id: 'circle',
      sequence: 1,
      subtitle: '圆形滚来滚去。',
      region: { x: 40, y: 80, width: 200, height: 160 },
      protectedRegions: [],
    },
    {
      id: 'square',
      sequence: 2,
      subtitle: '正方形站得直。',
      region: { x: 320, y: 80, width: 200, height: 160 },
      protectedRegions: [],
    },
  ],
});

describe('whiteboard contract', () => {
  it('registers the template for LLM output validation', () => {
    expect(KNOWN_TEMPLATE_IDS.has('language.whiteboard-story')).toBe(true);
    expect(ANIMATION_TEMPLATES.find((template) => template.id === 'language.whiteboard-story')).toMatchObject({
      engine: 'remotion',
      ageGroups: ['3-4', '5-6'],
    });
  });

  it('accepts and normalizes a valid authoring contract', () => {
    const config = validConfig();
    config.regions[0].protectedRegions = undefined;
    config.regions[0].reveal = {
      direction: 'right_to_left',
      maskPaddingPx: 20,
      protectedRegions: [{ x: 40, y: 80, width: 20, height: 20 }],
    };
    const result = parseWhiteboardConfig(config);
    expect(result.error).toBeUndefined();
    expect(result.config).toMatchObject({
      sourceImage: 'whiteboard/shapes.png',
      paper: '#F6F1E3',
      inkPath: 'grid',
      colorFill: 'contour-wipe',
      canvas: { width: 800, height: 450 },
    });
    expect(result.config?.regions).toHaveLength(2);
    expect(result.config?.regions[0]).toMatchObject({
      protectedRegions: [{ x: 40, y: 80, width: 20, height: 20 }],
      reveal: { direction: 'right_to_left', maskPaddingPx: 20 },
    });
  });

  it.each([
    ['remote source', { sourceImage: 'https://example.com/image.png' }],
    ['path traversal', { sourceImage: 'whiteboard/../secret.png' }],
    ['absolute Windows path', { sourceImage: 'C:\\secret.png' }],
    ['skeleton runtime', { inkPath: 'skeleton' }],
    ['invalid color mode', { colorFill: 'fade' }],
    ['invalid paper', { paper: 'red' }],
  ])('rejects %s', (_label, patch) => {
    const result = parseWhiteboardConfig({ ...validConfig(), ...patch });
    expect(result.error).toBeTruthy();
    expect(result.config).toBeUndefined();
  });

  it('rejects out-of-canvas regions and non-contiguous sequence numbers', () => {
    const outside = validConfig();
    outside.regions[0].region.x = 700;
    expect(parseWhiteboardConfig(outside).error).toContain('region');

    const skipped = validConfig();
    skipped.regions[1].sequence = 3;
    expect(parseWhiteboardConfig(skipped).error).toContain('sequence');
  });

  it('rejects duplicate ids and invalid reveal options', () => {
    const duplicate = validConfig();
    duplicate.regions[1].id = 'circle';
    expect(parseWhiteboardConfig(duplicate).error).toContain('重复');

    const invalidDirection = validConfig();
    (invalidDirection.regions[0] as any).reveal = { direction: 'diagonal' };
    expect(parseWhiteboardConfig(invalidDirection).error).toContain('direction');
  });

  it('reads PNG dimensions and rejects malformed raster data', () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
    png.writeUInt32BE(1536, 16);
    png.writeUInt32BE(864, 20);
    expect(readRasterDimensions(png)).toEqual({ width: 1536, height: 864 });
    expect(readRasterDimensions(Buffer.from('not an image'))).toBeNull();
  });
});

describe('whiteboard timing', () => {
  it('uses subtitle pages, keeps regions serial, and reserves a half-second gaze', () => {
    const resolved = resolveWhiteboardTiming(validConfig(), {
      fps: 30,
      durationFrames: 300,
      subtitlePages: [
        { tokens: ['圆', '形'], starts: [30, 45] },
        { tokens: ['正', '方'], starts: [150, 165] },
      ],
    });

    expect(resolved.timingSource).toBe('subtitlePages');
    expect(resolved.regions[0].startFrame).toBe(30);
    expect(resolved.regions[1].startFrame).toBe(154);
    expect(resolved.regions[0].startFrame + resolved.regions[0].durationFrames).toBeLessThanOrEqual(
      resolved.regions[1].startFrame,
    );
    const last = resolved.regions[1];
    expect(last.startFrame + last.durationFrames).toBeLessThanOrEqual(285);
    for (const region of resolved.regions) {
      expect(region.inkFrames + region.colorFrames).toBe(region.durationFrames);
      expect(region.inkFrames).toBeGreaterThan(0);
      expect(region.colorFrames).toBeGreaterThan(0);
    }
  });

  it('falls back to authored milliseconds when no valid cue track exists', () => {
    const config = validConfig();
    config.regions[0].startMs = 1000;
    config.regions[0].durationMs = 2000;
    config.regions[1].startMs = 4000;
    config.regions[1].durationMs = 2000;
    const resolved = resolveWhiteboardTiming(config, {
      fps: 30,
      durationFrames: 240,
      subtitlePages: [{ tokens: ['无'], starts: [-1] }],
    });

    expect(resolved.timingSource).toBe('authored');
    expect(resolved.regions[0].startFrame).toBe(30);
    expect(resolved.regions[0].durationFrames).toBe(60);
    expect(resolved.regions[1].startFrame).toBe(120);
  });

  it('splits one subtitle page when multiple regions share a cue index', () => {
    const config = validConfig();
    config.regions[0].cueIndex = 0;
    config.regions[1].cueIndex = 0;
    const resolved = resolveWhiteboardTiming(config, {
      fps: 30,
      durationFrames: 300,
      subtitlePages: [
        { tokens: ['圆', '形'], starts: [0, 30] },
        { tokens: ['正', '方'], starts: [150, 180] },
      ],
    });

    expect(resolved.timingSource).toBe('subtitlePages');
    expect(resolved.regions[0].startFrame).toBe(0);
    expect(resolved.regions[0].startFrame + resolved.regions[0].durationFrames).toBeLessThanOrEqual(
      75,
    );
    expect(resolved.regions[1].startFrame).toBeGreaterThanOrEqual(79);
    expect(resolved.regions[1].startFrame + resolved.regions[1].durationFrames).toBeLessThanOrEqual(150);
  });

  it('weights estimated windows by narration length', () => {
    const config = validConfig();
    config.regions[0].subtitle = '圆';
    config.regions[1].subtitle = '正方形宝宝站得直';
    const resolved = resolveWhiteboardTiming(config, { fps: 30, durationFrames: 300 });

    expect(resolved.timingSource).toBe('estimated');
    expect(resolved.regions[1].durationFrames).toBeGreaterThan(resolved.regions[0].durationFrames);
  });
});
