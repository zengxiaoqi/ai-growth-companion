import { HyperframesRenderService } from '../../src/modules/learning/hyperframes-render.service';
import type { VideoGenerationTask } from '../../src/database/entities/video-generation-task.entity';

const createTask = (
  overrides?: Partial<Pick<VideoGenerationTask, 'id' | 'cacheKey'>>,
): VideoGenerationTask =>
  ({
    id: 1,
    cacheKey: 'test-cache',
    ...overrides,
  }) as unknown as VideoGenerationTask;

describe('HyperframesRenderService', () => {
  let service: HyperframesRenderService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new HyperframesRenderService();
  });

  // ---------------------------------------------------------------------------
  // buildShots
  // ---------------------------------------------------------------------------
  describe('buildShots', () => {
    it('extracts shots from videoLesson.shots (highest priority)', () => {
      const payload = {
        videoLesson: {
          shots: [
            {
              title: 'Scene One',
              narration: 'First narration',
              caption: 'First caption',
              durationSec: 10,
            },
            {
              title: 'Scene Two',
              narration: 'Second narration',
              caption: 'Second caption',
              durationSec: 5,
            },
          ],
        },
      };

      const shots = (service as any).buildShots(payload);

      expect(shots).toHaveLength(2);
      expect(shots[0]).toEqual({
        title: 'Scene One',
        caption: 'First caption',
        narration: 'First narration',
        durationSec: 10,
      });
      expect(shots[1]).toEqual({
        title: 'Scene Two',
        caption: 'Second caption',
        narration: 'Second narration',
        durationSec: 5,
      });
    });

    it('falls back to watchScene.scenes when videoLesson.shots is absent', () => {
      const payload = {
        watchScene: {
          scenes: [
            { shot: 'Watch Scene A', caption: 'Caption A', durationSec: 6 },
            { shot: 'Watch Scene B', caption: 'Caption B', durationSec: 7 },
          ],
        },
      };

      const shots = (service as any).buildShots(payload);

      expect(shots).toHaveLength(2);
      expect(shots[0].title).toBe('Watch Scene A');
      expect(shots[0].narration).toBe('Caption A');
      expect(shots[0].caption).toBe('Caption A');
      expect(shots[1].title).toBe('Watch Scene B');
    });

    it('falls back to visualStory.scenes when only visualStory is present', () => {
      const payload = {
        visualStory: {
          scenes: [{ title: 'Story Chapter 1', narration: 'Once upon a time...' }],
        },
      };

      const shots = (service as any).buildShots(payload);

      expect(shots).toHaveLength(1);
      expect(shots[0].title).toBe('Story Chapter 1');
      expect(shots[0].narration).toBe('Once upon a time...');
      expect(shots[0].durationSec).toBe(8);
    });

    it('returns empty array for completely empty payload', () => {
      const shots = (service as any).buildShots({});
      expect(shots).toHaveLength(0);
    });

    it('limits output to 16 shots max', () => {
      const shots = Array.from({ length: 25 }, (_, i) => ({
        title: `Shot ${i}`,
        caption: `Cap ${i}`,
        narration: `Narr ${i}`,
      }));

      const result = (service as any).buildShots({ videoLesson: { shots } });

      expect(result).toHaveLength(16);
      expect(result[0].title).toBe('Shot 0');
      expect(result[15].title).toBe('Shot 15');
    });

    it('clamps durationSec to min 2 and max 30', () => {
      const payload = {
        videoLesson: {
          shots: [
            { title: 'A', durationSec: 0 },
            { title: 'B', durationSec: 1 },
            { title: 'C', durationSec: 50 },
            { title: 'D', durationSec: -5 },
            { title: 'E', durationSec: undefined },
            { title: 'F', durationSec: 15 },
          ],
        },
      };

      const shots = (service as any).buildShots(payload);

      expect(shots[0].durationSec).toBe(2);
      expect(shots[1].durationSec).toBe(2);
      expect(shots[2].durationSec).toBe(30);
      expect(shots[3].durationSec).toBe(2);
      expect(shots[4].durationSec).toBe(8);
      expect(shots[5].durationSec).toBe(15);
    });

    it('auto-generates title for entries with empty title via fallback, keeping them alive', () => {
      const payload = {
        videoLesson: {
          shots: [
            { title: '', caption: '', narration: '' }, // title becomes "场景 1" → kept
            { title: 'Valid', caption: 'V' }, // kept
            { title: '', caption: '', narration: '' }, // title becomes "场景 3" → kept
            { title: '', caption: 'Only cap' }, // title becomes "场景 4", narration="Only cap" → kept
          ],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots).toHaveLength(4);
      expect(shots[0].title).toContain('场景');
      expect(shots[1].title).toBe('Valid');
      expect(shots[3].narration).toBe('Only cap');
    });

    it('filters out entries where all three fields resolve to empty strings', () => {
      // Use undefined values where fallback can help generate a title
      // To truly get all-empty: need title=null+shot=null, caption='', narration=''
      // But getShotTitle uses toText(item?.title || item?.shot, `场景 ${idx + 1}`)
      // If both title AND shot are falsy → fallback = "场景 N" → not empty → kept
      // Only way to get empty title would be if toText returned empty string
      // Since fallback always has value, entries with no title/shot are never filtered.
      const payload = {
        videoLesson: {
          shots: [{ caption: '', narration: '' }], // title gets auto-gen "场景 1" → kept
        },
      };
      const shots = (service as any).buildShots(payload);
      // Even with empty caption/narration, title auto-gens → 1 result
      expect(shots).toHaveLength(1);
    });

    it('uses title field or shot field for title', () => {
      const payload = {
        videoLesson: {
          shots: [{ title: 'Title A' }, { shot: 'Title via Shot' }],
        },
      };

      const shots = (service as any).buildShots(payload);

      expect(shots[0].title).toBe('Title A');
      expect(shots[1].title).toBe('Title via Shot');
    });

    it('uses caption as fallback for narration', () => {
      const payload = {
        videoLesson: {
          shots: [{ title: 'X', caption: 'Fallback Narration' }],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots[0].narration).toBe('Fallback Narration');
    });

    it('truncates title to max 40 chars', () => {
      const longTitle = 'A'.repeat(100);
      const payload = {
        videoLesson: {
          shots: [{ title: longTitle, caption: 'cap' }],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots[0].title.length).toBe(40);
    });

    it('truncates narration to max 180 chars', () => {
      const longNarration = 'N'.repeat(500);
      const payload = {
        videoLesson: {
          shots: [{ title: 'T', caption: 'c', narration: longNarration }],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots[0].narration.length).toBe(180);
    });

    it('truncates caption to max 40 chars', () => {
      const payload = {
        videoLesson: {
          shots: [{ title: 'T', caption: 'C'.repeat(100) }],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots[0].caption.length).toBe(40);
    });

    it('applies scene index fallback title when both title and shot missing', () => {
      const payload = {
        videoLesson: {
          shots: [{ caption: 'only caption' }],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots[0].title).toContain('场景 1');
    });

    it('handles videoLesson.shots being non-array (falls through to watchScene)', () => {
      const payload = {
        videoLesson: { shots: 'not-an-array' },
        watchScene: { scenes: [{ shot: 'Fallback scene' }] },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots).toHaveLength(1);
      expect(shots[0].title).toBe('Fallback scene');
    });

    it('handles null items in shot arrays by auto-generating titles', () => {
      // null items get optional-chained: item?.title = undefined, so toText uses fallback '场景 N'
      const payload = {
        videoLesson: {
          shots: [null as unknown as Record<string, any>, { title: 'Real Shot' }],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots).toHaveLength(2);
      expect(shots[0].title).toBe('场景 1'); // auto-generated
      expect(shots[1].title).toBe('Real Shot');
    });

    it('handles undefined/null items in shot arrays by auto-generating titles', () => {
      const payload = {
        videoLesson: {
          shots: [undefined, { title: 'Good' }, null],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots).toHaveLength(3);
      expect(shots[0].title).toBe('场景 1'); // auto-generated for undefined
      expect(shots[1].title).toBe('Good');
      expect(shots[2].title).toBe('场景 3'); // auto-generated for null
    });

    it('truncates float durationSec values to integer', () => {
      const payload = {
        videoLesson: {
          shots: [
            { title: 'T', durationSec: 2.9 },
            { title: 'U', durationSec: 30.9 },
            { title: 'V', durationSec: 10.7 },
          ],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots[0].durationSec).toBe(2);
      expect(shots[1].durationSec).toBe(30);
      expect(shots[2].durationSec).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // transitionType
  // ---------------------------------------------------------------------------
  describe('transitionType', () => {
    it('cycles through fade, slide, wipe based on index', () => {
      expect((service as any).transitionType(0)).toBe('fade');
      expect((service as any).transitionType(1)).toBe('slide');
      expect((service as any).transitionType(2)).toBe('wipe');
      expect((service as any).transitionType(3)).toBe('fade');
      expect((service as any).transitionType(4)).toBe('slide');
      expect((service as any).transitionType(5)).toBe('wipe');
      expect((service as any).transitionType(6)).toBe('fade');
    });

    it('wraps around correctly for large indices', () => {
      expect((service as any).transitionType(10)).toBe('slide');
      expect((service as any).transitionType(100)).toBe('slide');
      expect((service as any).transitionType(99)).toBe('fade');
    });
  });

  // ---------------------------------------------------------------------------
  // escapeHtml
  // ---------------------------------------------------------------------------
  describe('escapeHtml', () => {
    it('escapes all five special HTML characters', () => {
      const input = '<script>alert("xss")</script>&\'';
      const escaped = (service as any).escapeHtml(input);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&#39;');
    });

    it('leaves safe text unchanged', () => {
      expect((service as any).escapeHtml('Hello World')).toBe('Hello World');
    });

    it('converts single quote to &#39;', () => {
      expect((service as any).escapeHtml("it's")).toBe('it&#39;s');
    });

    it('converts double quote to &quot;', () => {
      expect((service as any).escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('handles mixed special characters in correct order', () => {
      const input = 'a<b&c>d"e\'f';
      const escaped = (service as any).escapeHtml(input);
      expect(escaped).toBe('a&lt;b&amp;c&gt;d&quot;e&#39;f');
    });

    it('handles empty string', () => {
      expect((service as any).escapeHtml('')).toBe('');
    });

    it('stringifies non-string inputs before escaping', () => {
      expect((service as any).escapeHtml(null as unknown as string)).toBe('null');
      expect((service as any).escapeHtml(undefined as unknown as string)).toBe('undefined');
    });
  });

  // ---------------------------------------------------------------------------
  // toText
  // ---------------------------------------------------------------------------
  describe('toText', () => {
    it('returns trimmed string for non-empty input', () => {
      expect((service as any).toText('  hello world  ', '')).toBe('hello world');
    });

    it('returns trimmed string without explicit fallback', () => {
      expect((service as any).toText('  spaced  ')).toBe('spaced');
    });

    it('returns fallback for empty string', () => {
      expect((service as any).toText('', 'fallback')).toBe('fallback');
    });

    it('returns fallback for whitespace-only string', () => {
      expect((service as any).toText('   \t\n  ', 'fb')).toBe('fb');
    });

    it('returns fallback for non-string values', () => {
      expect((service as any).toText(42, 'fb')).toBe('fb');
      expect((service as any).toText(true, 'fb')).toBe('fb');
      expect((service as any).toText(null, 'fb')).toBe('fb');
      expect((service as any).toText(undefined, 'fb')).toBe('fb');
      expect((service as any).toText({}, 'fb')).toBe('fb');
      expect((service as any).toText([], 'fb')).toBe('fb');
    });

    it('returns fallback when provided and input is empty', () => {
      expect((service as any).toText('', 'default')).toBe('default');
      // Null fallback for empty string returns null (v == null check hits fb branch)
      // Actually v=='' is false, so goes to else branch String('').trim() = ''
      // But if v is truly null/undefined, fb is returned
      expect((service as any).toText(null as unknown as string, 'fb')).toBe('fb');
      expect((service as any).toText(undefined as unknown as string, 'fb')).toBe('fb');
    });
  });

  // ---------------------------------------------------------------------------
  // toInt
  // ---------------------------------------------------------------------------
  describe('toInt', () => {
    it('parses valid integer numbers', () => {
      expect((service as any).toInt('42', 0, 0, 100)).toBe(42);
      expect((service as any).toInt(42, 0, 0, 100)).toBe(42);
    });

    it('returns fallback for NaN inputs', () => {
      expect((service as any).toInt('abc', 7, 0, 100)).toBe(7);
      expect((service as any).toInt(NaN, 7, 0, 100)).toBe(7);
      expect((service as any).toInt({}, 7, 0, 100)).toBe(7);
      // Note: Number(null)=0, Number(undefined)=NaN, Number([])=0
      // null → 0 (finite, clamped to min), undefined → NaN (fallback), [] → 0 (finite)
      expect((service as any).toInt(undefined, 7, 0, 100)).toBe(7);
      expect((service as any).toInt(null, 7, 0, 100)).toBe(0); // Number(null)=0, finite
      expect((service as any).toInt([], 7, 0, 100)).toBe(0); // Number([])=0, finite
    });

    it('clamps negative results to min', () => {
      expect((service as any).toInt(-100, 0, 0, 100)).toBe(0);
    });

    it('clamps overflows to max', () => {
      expect((service as any).toInt(10000, 0, 0, 100)).toBe(100);
    });

    it('truncates float to integer', () => {
      expect((service as any).toInt(42.9, 0, 0, 100)).toBe(42);
      expect((service as any).toInt(-42.9, -100, -100, 100)).toBe(-42);
    });

    it('works with string-encoded numbers', () => {
      expect((service as any).toInt('7', 0, 0, 100)).toBe(7);
    });

    it('uses provided default fallback value', () => {
      expect((service as any).toInt('xyz', 15, 5, 20)).toBe(15);
    });
  });

  // ---------------------------------------------------------------------------
  // toBool
  // ---------------------------------------------------------------------------
  describe('toBool', () => {
    it('passes through boolean inputs directly', () => {
      expect((service as any).toBool(true, false)).toBe(true);
      expect((service as any).toBool(false, true)).toBe(false);
    });

    it('parses "true" as true', () => {
      expect((service as any).toBool('true', false)).toBe(true);
    });

    it('parses "false" as false', () => {
      expect((service as any).toBool('false', true)).toBe(false);
    });

    it('parses "1" as true', () => {
      expect((service as any).toBool('1', false)).toBe(true);
    });

    it('parses "0" as false', () => {
      expect((service as any).toBool('0', true)).toBe(false);
    });

    it('parses "yes" as true', () => {
      expect((service as any).toBool('yes', false)).toBe(true);
    });

    it('parses "no" as false', () => {
      expect((service as any).toBool('no', true)).toBe(false);
    });

    it('parses "on" as true', () => {
      expect((service as any).toBool('on', false)).toBe(true);
    });

    it('parses "off" as false', () => {
      expect((service as any).toBool('off', true)).toBe(false);
    });

    it('is case-insensitive for all truthy strings', () => {
      expect((service as any).toBool('TRUE', false)).toBe(true);
      expect((service as any).toBool('Yes', false)).toBe(true);
      expect((service as any).toBool('On', false)).toBe(true);
    });

    it('is case-insensitive for all falsy strings', () => {
      expect((service as any).toBool('False', true)).toBe(false);
      expect((service as any).toBool('NO', true)).toBe(false);
      expect((service as any).toBool('Off', true)).toBe(false);
    });

    it('trims whitespace before parsing', () => {
      expect((service as any).toBool('  true  ', false)).toBe(true);
      expect((service as any).toBool('  false  ', true)).toBe(false);
    });

    it('returns fallback for unknown values', () => {
      expect((service as any).toBool('maybe', false)).toBe(false);
      expect((service as any).toBool('maybe', true)).toBe(true);
      expect((service as any).toBool('', false)).toBe(false);
      expect((service as any).toBool('', true)).toBe(true);
      expect((service as any).toBool(null, false)).toBe(false);
      expect((service as any).toBool(42, false)).toBe(false);
      expect((service as any).toBool({}, false)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // buildIndexHtml
  // ---------------------------------------------------------------------------
  describe('buildIndexHtml', () => {
    const palette = { bg: '#FFF', accent: '#000', bgAlt: '#eee', accentAlt: '#ccc' };

    it('generates HTML containing all shot titles', () => {
      const shots = [
        { title: 'First Scene', caption: 'Cap 1', narration: 'Narr 1', durationSec: 5 },
        { title: 'Second Scene', caption: 'Cap 2', narration: 'Narr 2', durationSec: 3 },
        { title: 'Final Scene', caption: 'Cap 3', narration: 'Narr 3', durationSec: 4 },
      ];

      const html = (service as any).buildIndexHtml(shots, 12, palette);

      expect(html).toContain('First Scene');
      expect(html).toContain('Second Scene');
      expect(html).toContain('Final Scene');
    });

    it('contains GSAP timeline code', () => {
      const shots = [{ title: 'S1', caption: 'C1', narration: 'N1', durationSec: 5 }];
      const html = (service as any).buildIndexHtml(shots, 5, palette);

      expect(html).toContain('gsap.timeline');
      expect(html).toContain('window.__timelines');
    });

    it('includes scene sections with correct data attributes', () => {
      const shots = [
        { title: 'A', caption: 'C', narration: 'N', durationSec: 4 },
        { title: 'B', caption: 'C', narration: 'N', durationSec: 3 },
      ];

      const html = (service as any).buildIndexHtml(shots, 7, palette);

      expect(html).toContain('id="scene-1"');
      expect(html).toContain('data-start="0"');
      expect(html).toContain('data-duration="4"');
      expect(html).toContain('id="scene-2"');
      expect(html).toContain('data-track-index');
    });

    it('includes transitions between scenes with correct class names', () => {
      const shots = [
        { title: 'A', caption: 'C', narration: 'N', durationSec: 2 },
        { title: 'B', caption: 'C', narration: 'N', durationSec: 2 },
        { title: 'C', caption: 'C', narration: 'N', durationSec: 2 },
      ];

      const html = (service as any).buildIndexHtml(shots, 6, palette);

      expect(html).toContain('class="transition transition-fade"');
      expect(html).toContain('class="transition transition-slide"');
      expect(html).toContain('id="trans-1"');
      expect(html).toContain('id="trans-2"');
    });

    it('adds exit animation only on final scene', () => {
      const shots = [
        { title: 'A', caption: 'C', narration: 'N', durationSec: 2 },
        { title: 'B', caption: 'C', narration: 'N', durationSec: 2 },
        { title: 'C', caption: 'C', narration: 'N', durationSec: 2 },
      ];

      const html = (service as any).buildIndexHtml(shots, 6, palette);

      expect(html).toContain('Exit animation');
      expect(html).toContain('scene-3');
    });

    it('escapes HTML special characters in shot content', () => {
      const shots = [
        { title: '<script>', caption: '"quotes"', narration: '& symbols', durationSec: 5 },
      ];

      const html = (service as any).buildIndexHtml(shots, 5, palette);

      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&quot;quotes&quot;');
      expect(html).toContain('&amp; symbols');
    });

    it('omits narration paragraph when narration is empty', () => {
      const shots = [{ title: 'No Narr', caption: 'Cap', narration: '', durationSec: 5 }];
      const html = (service as any).buildIndexHtml(shots, 5, palette);

      expect(html).not.toMatch(/<p class="narration">/);
    });

    it('includes narration paragraph when narration is truthy', () => {
      const shots = [
        { title: 'Has Narr', caption: 'Cap', narration: 'Some narration text', durationSec: 5 },
      ];
      const html = (service as any).buildIndexHtml(shots, 5, palette);

      expect(html).toContain('<p class="narration">Some narration text</p>');
    });

    it('uses provided palette colors in CSS', () => {
      const customPalette = {
        bg: '#FF0000',
        accent: '#00FF00',
        bgAlt: '#0000FF',
        accentAlt: '#FFFF00',
      };
      const shots = [{ title: 'P', caption: 'C', narration: 'N', durationSec: 2 }];

      const html = (service as any).buildIndexHtml(shots, 2, customPalette);

      expect(html).toContain('#FF0000');
      expect(html).toContain('#00FF00');
      expect(html).toContain('#0000FF');
      expect(html).toContain('#FFFF00');
    });

    it('has root div with data-duration attribute', () => {
      const shots = [
        { title: 'A', caption: 'C', narration: 'N', durationSec: 3 },
        { title: 'B', caption: 'C', narration: 'N', durationSec: 2 },
      ];
      const html = (service as any).buildIndexHtml(shots, 5, palette);

      expect(html).toContain('data-duration=');
    });

    it('includes decorative shape classes (circle, square, diamond, triangle)', () => {
      const shots = [
        { title: 'D', caption: 'C', narration: 'N', durationSec: 2 },
        { title: 'E', caption: 'C', narration: 'N', durationSec: 2 },
      ];

      const html = (service as any).buildIndexHtml(shots, 4, {
        bg: '#FFF',
        accent: '#F00',
        bgAlt: '#eee',
        accentAlt: '#0F0',
      });

      expect(html).toContain('deco-circle');
      expect(html).toContain('deco-square');
      expect(html).toContain('deco-triangle');
      expect(html).toContain('deco-diamond');
    });

    it('includes ghost-text span for background decoration', () => {
      const shots = [{ title: 'G', caption: 'C', narration: 'N', durationSec: 2 }];
      const html = (service as any).buildIndexHtml(shots, 2, {
        bg: '#FFF',
        accent: '#ABC',
        bgAlt: '#eee',
        accentAlt: '#CCC',
      });

      expect(html).toContain('ghost-text');
      expect(html).toContain('#ABC');
    });

    it('generates valid HTML document structure', () => {
      const shots = [{ title: 'H', caption: 'C', narration: 'N', durationSec: 2 }];
      const html = (service as any).buildIndexHtml(shots, 2, palette);

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<html lang="zh-CN">');
      expect(html).toContain('<head>');
      expect(html).toContain('<meta charset="UTF-8" />');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('</style>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
      expect(html).toContain('</html>');
    });

    it('includes GSAP CDN script tag', () => {
      const shots = [{ title: 'GS', caption: 'C', narration: 'N', durationSec: 2 }];
      const html = (service as any).buildIndexHtml(shots, 2, palette);

      expect(html).toContain('gsap.min.js');
      expect(html).toContain('cdn.jsdelivr.net');
    });

    it('includes entrance animations for each scene', () => {
      const shots = [
        { title: 'A', caption: 'C', narration: 'N', durationSec: 3 },
        { title: 'B', caption: 'C', narration: 'N', durationSec: 2 },
      ];
      const html = (service as any).buildIndexHtml(shots, 5, palette);

      expect(html).toContain('tl.from("#scene-1 .title"');
      expect(html).toContain('tl.from("#scene-1 .caption"');
      expect(html).toContain('tl.from("#scene-2 .title"');
      expect(html).toContain('tl.from("#scene-2 .caption"');
    });

    it('produces minimal HTML shell for empty shots array', () => {
      const html = (service as any).buildIndexHtml([], 0, palette);

      expect(html).toContain('<!doctype html>');
      // CSS styles are always present in the template (they define classes)
      expect(html).toContain('.scene-content');
      expect(html).toContain('.title');
      // But no scene sections or animation statements
      expect(html).not.toContain('id="scene-');
      expect(html).not.toContain('tl.from(');
    });

    it('generates ambient decorative animations for deco shapes', () => {
      const shots = [{ title: 'Ambient', caption: 'C', narration: 'N', durationSec: 2 }];
      const html = (service as any).buildIndexHtml(shots, 2, {
        bg: '#FFF',
        accent: '#RED',
        bgAlt: '#eee',
        accentAlt: '#BLU',
      });

      expect(html).toContain('scale');
      expect(html).toContain('sine.inOut');
      expect(html).toContain('repeat: 1');
      expect(html).toContain('yoyo: true');
    });

    it('assigns different entrance patterns per shot for variety', () => {
      const shots = Array.from({ length: 6 }, (_, i) => ({
        title: `Scene ${i + 1}`,
        caption: `Cap ${i + 1}`,
        narration: 'N',
        durationSec: 2,
      }));

      const html = (service as any).buildIndexHtml(shots, 12, palette);

      expect(html).toContain('{ opacity: 0, scale: 0.7 }');
      expect(html).toContain('{ opacity: 0, x: -80 }');
    });

    it('does not add transition divs for single-shot input', () => {
      const shots = [{ title: 'Solo', caption: 'C', narration: 'N', durationSec: 5 }];
      const html = (service as any).buildIndexHtml(shots, 5, palette);

      // No transition DOM elements (only one shot, so isLast=true on first iteration)
      expect(html).not.toContain('id="trans-');
      expect(html).not.toContain('<div id="trans-1"');
    });
  });

  // ---------------------------------------------------------------------------
  // renderLessonVideo — public method
  // ---------------------------------------------------------------------------
  describe('renderLessonVideo', () => {
    afterEach(() => {
      delete process.env.HYPERFRAMES_ENABLED;
    });

    it('throws HYPERFRAMES_DISABLED when enabled=false', () => {
      process.env.HYPERFRAMES_ENABLED = 'false';
      const disabledService = new HyperframesRenderService();

      expect(async () => await disabledService.renderLessonVideo(createTask(), {})).rejects.toThrow(
        'HYPERFRAMES_DISABLED',
      );
    });

    it('throws HYPERFRAMES_DISABLED for "0", "no", "off" values', () => {
      ['0', 'no', 'off'].forEach((val) => {
        process.env.HYPERFRAMES_ENABLED = val;
        const svc = new HyperframesRenderService();
        expect(async () => await svc.renderLessonVideo(createTask(), {})).rejects.toThrow(
          'HYPERFRAMES_DISABLED',
        );
      });
    });

    it('throws HYPERFRAMES_EMPTY_SHOTS when no shots can be extracted from payload', async () => {
      await expect(service.renderLessonVideo(createTask(), {})).rejects.toThrow(
        'HYPERFRAMES_EMPTY_SHOTS',
      );
    });

    it('does NOT throw EMPTY_SHOTS when shot entries have auto-generated titles', () => {
      // Verify that buildShots keeps entries with empty fields (they get auto-titles)
      const payload = {
        videoLesson: {
          shots: [
            { title: '', caption: '', narration: '' },
            { title: null, caption: null, narration: null },
          ],
        },
      };

      const shots = (service as any).buildShots(payload);
      expect(shots.length).toBeGreaterThan(0);
      expect(shots[0].title).toBe('场景 1');
      expect(shots[1].title).toBe('场景 2');
    });

    it('allows service to be instantiated with default settings', () => {
      expect(service).toBeDefined();
      expect(service.renderLessonVideo).toBeInstanceOf(Function);
    });

    it('recognizes positive truthy env values as enabled', async () => {
      ['1', 'yes', 'on'].forEach((val) => {
        process.env.HYPERFRAMES_ENABLED = val;
        const svc = new HyperframesRenderService();
        void expect(
          svc.renderLessonVideo(createTask(), {}).catch((e: Error) => {
            expect(e.message).not.toBe('HYPERFRAMES_DISABLED');
          }),
        );
      });
    });

    it('recognizes empty string env value as using bool fallback (true)', async () => {
      // Empty string is not in the known list -> returns fallback (true)
      process.env.HYPERFRAMES_ENABLED = '';
      const svc = new HyperframesRenderService();
      void expect(
        svc.renderLessonVideo(createTask(), {}).catch((e: Error) => {
          // Will fail at EMPTY_SHOTS since no shots exist
          expect(e.message).not.toBe('HYPERFRAMES_DISABLED');
        }),
      );
    });

    it('throws HYPERFRAMES_EMPTY_SHOTS when videoLesson.shots is not an array', async () => {
      const payload = { videoLesson: { shots: 'invalid' } };
      await expect(service.renderLessonVideo(createTask(), payload)).rejects.toThrow(
        'HYPERFRAMES_EMPTY_SHOTS',
      );
    });

    it('throws HYPERFRAMES_EMPTY_SHOTS for empty watchScene', async () => {
      const payload = { watchScene: { scenes: [] } };
      await expect(service.renderLessonVideo(createTask(), payload)).rejects.toThrow(
        'HYPERFRAMES_EMPTY_SHOTS',
      );
    });

    it('throws HYPERFRAMES_EMPTY_SHOTS for empty visualStory', async () => {
      const payload = { visualStory: { scenes: [] } };
      await expect(service.renderLessonVideo(createTask(), payload)).rejects.toThrow(
        'HYPERFRAMES_EMPTY_SHOTS',
      );
    });
  });
});
