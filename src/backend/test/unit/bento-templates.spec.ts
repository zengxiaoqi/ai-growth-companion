/**
 * Comprehensive unit tests for all 6 Bento slide templates.
 * These are pure data transformation functions — no DI, no DB, no HTTP.
 */

import { AchievementTemplate } from '../../src/modules/bento/templates/achievement';
import { LessonPackTemplate } from '../../src/modules/bento/templates/lesson-pack';
import { PoetryTemplate } from '../../src/modules/bento/templates/poetry';
import { ReportWeeklyTemplate } from '../../src/modules/bento/templates/report-weekly';
import { ReportMonthlyTemplate } from '../../src/modules/bento/templates/report-monthly';
import { SemesterReportTemplate } from '../../src/modules/bento/templates/semester-report';
import type {
  Slide,
  TextElement,
  ShapeElement,
} from '../../src/modules/bento/interfaces/bento-document.interface';
import type { ReportData } from '../../src/modules/bento/interfaces/bento-template.interface';
import type {
  AchievementData,
  ContentSlideData,
  PoetryData,
  MonthlyReportData,
  SemesterData,
} from '../../src/modules/bento/interfaces/bento-template.interface';

// ── Helpers ──────────────────────────────────────────────────────────────────

function findTextEl(elements: Slide['elements'], id: string): TextElement | undefined {
  const el = elements.find((e) => e.id === id);
  return el?.type === 'text' ? el : undefined;
}

function findShapeEl(elements: Slide['elements'], id: string): ShapeElement | undefined {
  const el = elements.find((e) => e.id === id);
  return el?.type === 'shape' ? el : undefined;
}

function textBody(slide: Slide, id: string): string | undefined {
  return findTextEl(slide.elements, id)?.html;
}

function assertValidSlide(slide: Slide, expectElements: boolean): void {
  expect(typeof slide.id).toBe('string');
  expect(slide.id.length).toBeGreaterThan(0);
  expect(typeof slide.background).toBe('string');
  expect(typeof slide.transition).toBe('string');
  expect(Array.isArray(slide.elements)).toBe(true);
  if (expectElements) {
    expect(slide.elements.length).toBeGreaterThan(0);
  }
  // Elements can be text, shape, table, image, svg, chart, media
  expect(
    slide.elements.every((el) =>
      ['text', 'shape', 'table', 'image', 'svg', 'chart', 'media'].includes(el.type),
    ),
  ).toBe(true);
}

// ── Test Data Builders ───────────────────────────────────────────────────────

const DEFAULT_ACH = {
  id: 1,
  name: '阅读达人',
  description: '连续阅读 7 天',
  category: 'learning',
  tier: 'gold',
  unlocked: true,
  unlockedAt: '2026-01-01T00:00:00.000Z',
  progress: 7,
  totalRequired: 7,
};

function makeAchievementData(override?: Record<string, unknown>): AchievementData {
  const achievements =
    override?.achievements instanceof Array ? override.achievements : [DEFAULT_ACH];
  return {
    childName: typeof override?.childName === 'string' ? override.childName : '小明',
    achievements,
  };
}

// Use a special sentinel to distinguish "key missing" from "key set to undefined"
const UNSET = Symbol('unset');

const DEFAULT_SECTIONS = [
  { type: 'text' as const, content: '数字 1 像铅笔细又长' },
  { type: 'quiz' as const, content: '哪个是数字 1？' },
];

function makeContentData(partial?: Record<string, unknown>): ContentSlideData {
  const getVal = (k: string, def: string | string[] | unknown[]) =>
    k in (partial ?? {}) && partial![k] !== UNSET
      ? (partial![k] as string | string[] | unknown[])
      : def;
  const getStr = (k: string, def: string) => (typeof partial?.[k] === 'string' ? partial![k] : def);

  return {
    title: getStr('title', '认识数字 1'),
    subtitle: getVal('subtitle', '学前班') as string,
    ageRange: getStr('ageRange', '3-4'),
    domain: getStr('domain', '数学'),
    sections: getVal('sections', [...DEFAULT_SECTIONS]) as ContentSlideData['sections'],
    summary: getVal('summary', '掌握数字 1 的形态') as string,
  };
}

// For poetry, simplify: just pass partial overrides directly
function makePoetryData(partial?: Partial<PoetryData>): PoetryData {
  return {
    poemId: (partial?.poemId ?? 1) as number,
    title: partial?.title ?? '静夜思',
    author: partial?.author ?? '李白',
    dynasty: partial?.dynasty ?? '唐',
    type: partial?.type ?? '五绝',
    lines: partial?.lines ?? ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'],
    translation: partial?.translation ?? '明亮的月光洒在窗户前，好像地上铺了一层霜。',
    notes: partial?.notes ?? [{ term: '明月', explanation: '明亮的月亮' }],
    appreciation: partial?.appreciation ?? '这首诗表达了诗人的思乡之情。',
    background: partial?.background ?? '李白在外漂泊时所作。',
  };
}

function makeWeeklyData(partial?: Record<string, unknown>): ReportData {
  const o = partial ?? {};
  return {
    childName: typeof o.childName === 'string' ? o.childName : '小明',
    period: typeof o.period === 'string' ? o.period : 'weekly',
    startDate: typeof o.startDate === 'string' ? o.startDate : '2026-01-01',
    endDate: typeof o.endDate === 'string' ? o.endDate : '2026-01-07',
    totalLearningTime: typeof o.totalLearningTime === 'number' ? o.totalLearningTime : 3600,
    totalLessonsCompleted:
      typeof o.totalLessonsCompleted === 'number' ? o.totalLessonsCompleted : 10,
    averageScore: typeof o.averageScore === 'number' ? o.averageScore : 85,
    dailyStats:
      'dailyStats' in o
        ? (o.dailyStats as any)
        : [
            { date: '2026-01-01', totalTime: 600, completedLessons: 2, averageScore: 80 },
            { date: '2026-01-02', totalTime: 500, completedLessons: 1, averageScore: 90 },
          ],
    skillProgress:
      typeof o.skillProgress === 'object' && o.skillProgress !== null
        ? (o.skillProgress as Record<string, number>)
        : ({ language: 80, math: 70, science: 60 } as Record<string, number>),
    achievements: 'achievements' in o ? (o.achievements as any[]) : [],
    insights: 'insights' in o ? (o.insights as string[]) : ['继续加油！'],
    streak: typeof o.streak === 'number' ? o.streak : 3,
    encouragement: typeof o.encouragement === 'string' ? o.encouragement : 'Keep going!',
  };
}

function makeMonthlyData(partial?: Record<string, unknown>): MonthlyReportData {
  const o = partial ?? {};
  const base = makeWeeklyData(o) as MonthlyReportData;
  base.weekSummaries =
    'weekSummaries' in o
      ? (o.weekSummaries as any)
      : [
          { weekLabel: '第 1 周', totalTime: 800, completedLessons: 3, averageScore: 82 },
          { weekLabel: '第 2 周', totalTime: 900, completedLessons: 4, averageScore: 85 },
        ];
  base.trendHistory =
    'trendHistory' in o
      ? (o.trendHistory as any)
      : [{ label: '第 1 周', language: 70, math: 65, science: 60, art: 55, social: 50 }];
  base.monthlyHighlight =
    typeof o.monthlyHighlight === 'string' ? o.monthlyHighlight : '本月进步显著！';
  return base;
}

function makeSemesterData(override?: Partial<SemesterData>): SemesterData {
  return {
    childName: override?.childName ?? '小红',
    semesterLabel: override?.semesterLabel ?? '2026 年春季学期',
    startDate: override?.startDate ?? '2026-02-15',
    endDate: override?.endDate ?? '2026-07-01',
    summary: override?.summary ?? '本学期表现优秀，学习积极主动。',
    monthSummaries: override?.monthSummaries ?? [
      {
        month: '3 月',
        totalTime: 7200,
        completedLessons: 20,
        averageScore: 88,
        highlight: '第一次独立完成作业！',
        skills: { language: 85, math: 80 },
      },
    ],
    learnedPoems: override?.learnedPoems ?? [
      { title: '静夜思', author: '李白' },
      { title: '春晓', author: '孟浩然' },
    ],
    learnedLessons: override?.learnedLessons ?? [{ title: '认识数字', domain: '数学' }],
    achievements: override?.achievements ?? [
      { name: '全勤宝宝', tier: 'gold', unlockedAt: '2026-03-31T00:00:00.000Z' },
    ],
    totalLearningTime: override?.totalLearningTime ?? 43200,
    totalLessonsCompleted: override?.totalLessonsCompleted ?? 60,
    averageScore: override?.averageScore ?? 87,
    totalDaysStudied: override?.totalDaysStudied ?? 90,
    skillGrowth: override?.skillGrowth ?? {
      language: { start: 60, end: 85 },
      math: { start: 50, end: 75 },
    },
  };
}

// ═══════════════════════ 1. AchievementTemplate ═════════════════════════════

describe('AchievementTemplate', () => {
  const tmpl = new AchievementTemplate();

  describe('defaultTheme', () => {
    it('returns valid theme object with dark bg and gold accent', () => {
      const theme = tmpl.defaultTheme();
      expect(theme).toHaveProperty('background', '#0D1117');
      expect(theme).toHaveProperty('color', '#E6EDF3');
      expect(theme).toHaveProperty('accent', '#FFD700');
      expect(theme).toHaveProperty('fontFamily');
      expect(typeof theme.fontFamily).toBe('string');
      expect(theme.fontFamily.length).toBeGreaterThan(0);
    });
  });

  describe('toSlides', () => {
    it('returns correct slide count for single achievement: cover + 1 page + stats', () => {
      const slides = tmpl.toSlides(
        makeAchievementData({ achievements: [DEFAULT_ACH] }),
        tmpl.defaultTheme(),
      );
      expect(slides.length).toBe(3);
    });

    it('returns correct slide count for 6 achievements: cover + 2 pages + stats', () => {
      const achs = Array.from({ length: 6 }, (_, i) => ({
        ...DEFAULT_ACH,
        id: i + 1,
        name: `Achievement ${i + 1}`,
      }));
      const slides = tmpl.toSlides(
        makeAchievementData({ achievements: achs }),
        tmpl.defaultTheme(),
      );
      expect(slides.length).toBe(4);
    });

    it('slide IDs follow expected pattern', () => {
      const slides = tmpl.toSlides(makeAchievementData(), tmpl.defaultTheme());
      expect(slides[0].id).toBe('achievement-cover');
      expect(slides[slides.length - 1].id).toBe('achievement-stats');
      expect(slides[1].id.startsWith('achievements-page-')).toBe(true);
    });

    it('every slide has valid structure and non-empty elements', () => {
      const slides = tmpl.toSlides(makeAchievementData(), tmpl.defaultTheme());
      slides.forEach((slide) => assertValidSlide(slide, true));
    });

    it('childName appears in cover slide text element', () => {
      const slides = tmpl.toSlides(makeAchievementData({ childName: '乐乐' }), tmpl.defaultTheme());
      expect(textBody(slides[0], 'cover-name')).toContain('乐乐');
    });

    it('handles empty achievements array: cover + 0 pages + stats = 2 slides', () => {
      const slides = tmpl.toSlides(makeAchievementData({ achievements: [] }), tmpl.defaultTheme());
      expect(slides.length).toBe(2);
      expect(slides[0].id).toBe('achievement-cover');
      expect(slides[1].id).toBe('achievement-stats');
      slides.forEach((s) => assertValidSlide(s, true));
    });

    it('handles many achievements (≥ 10) across multiple pages', () => {
      const achs = Array.from({ length: 10 }, (_, i) => ({
        ...DEFAULT_ACH,
        id: i + 1,
        name: `Achievement ${i + 1}`,
      }));
      const slides = tmpl.toSlides(
        makeAchievementData({ achievements: achs }),
        tmpl.defaultTheme(),
      );
      // cover + 3 pages (4+4+2) + stats = 5
      expect(slides.length).toBe(5);
      expect(slides[1].id).toBe('achievements-page-0');
      expect(slides[3].id).toBe('achievements-page-2');
    });
  });
});

// ═══════════════════════ 2. LessonPackTemplate ══════════════════════════════

describe('LessonPackTemplate', () => {
  const tmpl = new LessonPackTemplate();

  describe('defaultTheme', () => {
    it('returns learning theme with green accent', () => {
      const theme = tmpl.defaultTheme();
      expect(theme).toHaveProperty('background', '#FFFFFF');
      expect(theme).toHaveProperty('color', '#2C3E50');
      expect(theme).toHaveProperty('accent', '#2ECC71');
      expect(typeof theme.fontFamily).toBe('string');
    });
  });

  describe('toSlides', () => {
    it('returns cover + N sections + summary when summary provided', () => {
      const data = makeContentData();
      const slides = tmpl.toSlides(data, tmpl.defaultTheme());
      expect(slides.length).toBe(1 + data.sections.length + 1); // 4
    });

    it('returns cover + N sections only when summary is unset', () => {
      const data = makeContentData({ summary: '' });
      const slides = tmpl.toSlides(data, tmpl.defaultTheme());
      expect(slides.length).toBe(1 + data.sections.length);
    });

    it('returns only cover slide when no sections at all and no summary', () => {
      const data = makeContentData({ sections: [], summary: '' });
      const slides = tmpl.toSlides(data, tmpl.defaultTheme());
      expect(slides.length).toBe(1);
      expect(slides[0].id).toBe('cover');
    });

    it('slide IDs: cover → section-0 → section-1 → summary', () => {
      const slides = tmpl.toSlides(makeContentData(), tmpl.defaultTheme());
      expect(slides[0].id).toBe('cover');
      expect(slides[1].id).toBe('section-0');
      expect(slides[2].id).toBe('section-1');
      expect(slides[3].id).toBe('summary');
    });

    it('every slide has valid elements', () => {
      const slides = tmpl.toSlides(makeContentData(), tmpl.defaultTheme());
      slides.forEach((slide) => assertValidSlide(slide, true));
    });

    it('title propagates to cover slide', () => {
      const slides = tmpl.toSlides(makeContentData({ title: '我的标题' }), tmpl.defaultTheme());
      expect(textBody(slides[0], 'cover-title')).toBe('我的标题');
    });

    it('subtitle renders with default value when not overridden', () => {
      const slides = tmpl.toSlides(makeContentData(), tmpl.defaultTheme());
      const subEl = findTextEl(slides[0].elements, 'cover-subtitle');
      expect(subEl).toBeDefined();
      expect(subEl!.html).toContain('学前班');
    });

    it('text-section body matches input content', () => {
      const slides = tmpl.toSlides(
        makeContentData({ sections: [{ type: 'text', content: 'Hello world' }] }),
        tmpl.defaultTheme(),
      );
      expect(textBody(slides[1], 'section-0-content')).toBe('Hello world');
    });

    it('quiz section renders a card shape', () => {
      const slides = tmpl.toSlides(
        makeContentData({ sections: [{ type: 'quiz', content: 'Question?' }] }),
        tmpl.defaultTheme(),
      );
      const card = findShapeEl(slides[1].elements, 'section-0-card');
      expect(card).toBeDefined();
      expect(card!.shape).toBe('rect');
    });

    it('handles many sections (≥ 10)', () => {
      const sections = Array.from({ length: 10 }, (_, i) => ({
        type: ['text', 'image', 'game', 'quiz'][i % 4] as 'text' | 'image' | 'game' | 'quiz',
        content: `Section content ${i + 1}`,
      }));
      // Pass empty string (falsy) for summary to avoid the extra summary slide
      const slides = tmpl.toSlides(makeContentData({ sections, summary: '' }), tmpl.defaultTheme());
      expect(slides.length).toBe(1 + 10);
    });
  });
});

// ═══════════════════════ 3. PoetryTemplate ══════════════════════════════════

describe('PoetryTemplate', () => {
  const tmpl = new PoetryTemplate();

  describe('defaultTheme', () => {
    it('returns classical beige-paper theme', () => {
      const theme = tmpl.defaultTheme();
      expect(theme).toHaveProperty('background', '#FFF8E7');
      expect(theme).toHaveProperty('color', '#3D2B1F');
      expect(theme).toHaveProperty('accent', '#C0392B');
      expect(typeof theme.fontFamily).toBe('string');
    });
  });

  describe('toSlides', () => {
    it('returns 6 slides when background is provided', () => {
      const slides = tmpl.toSlides(
        makePoetryData({ background: 'Background story' }),
        tmpl.defaultTheme(),
      );
      expect(slides.length).toBe(6);
    });

    it('returns 5 slides when background is falsy (empty string)', () => {
      const slidesEmpty = tmpl.toSlides(makePoetryData({ background: '' }), tmpl.defaultTheme());
      expect(slidesEmpty.length).toBe(5);
    });

    it('slide IDs with background include all 6 sections', () => {
      const slides = tmpl.toSlides(makePoetryData({ background: 'Story' }), tmpl.defaultTheme());
      expect(slides.map((s) => s.id)).toEqual([
        'title',
        'original',
        'translation',
        'background',
        'notes',
        'appreciation',
      ]);
    });

    it('slide IDs without background have exactly 5 sections', () => {
      const slides = tmpl.toSlides(makePoetryData({ background: '' }), tmpl.defaultTheme());
      expect(slides.map((s) => s.id)).toEqual([
        'title',
        'original',
        'translation',
        'notes',
        'appreciation',
      ]);
    });

    it('every slide has valid elements', () => {
      const slides = tmpl.toSlides(makePoetryData(), tmpl.defaultTheme());
      slides.forEach((slide) => assertValidSlide(slide, true));
    });

    it('title and author appear in title slide', () => {
      const slides = tmpl.toSlides(
        makePoetryData({ title: '望庐山瀑布', author: '李白', dynasty: '唐' }),
        tmpl.defaultTheme(),
      );
      expect(textBody(slides[0], 'poem-title')).toContain('望庐山瀑布');
      const authorText = textBody(slides[0], 'poem-author');
      expect(authorText).toContain('唐');
      expect(authorText).toContain('李白');
    });

    it('poem lines render in original slide', () => {
      const slides = tmpl.toSlides(
        makePoetryData({ lines: ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'] }),
        tmpl.defaultTheme(),
      );
      const origHtml = textBody(slides[1], 'orig-content')!;
      expect(origHtml).toContain('白日依山尽');
      expect(origHtml).toContain('黄河入海流');
    });

    it('handles empty notes array', () => {
      const slides = tmpl.toSlides(makePoetryData({ notes: [] }), tmpl.defaultTheme());
      const notesSlide = slides.find((s) => s.id === 'notes');
      expect(notesSlide!.elements.length).toBeGreaterThan(0);
    });

    it('handles empty lines gracefully', () => {
      const slides = tmpl.toSlides(makePoetryData({ lines: [] }), tmpl.defaultTheme());
      expect(slides.length).toBe(6); // title+original+translation+background+notes+appreciation
      const origSlide = slides.find((s) => s.id === 'original');
      expect(origSlide!.elements.some((e) => e.type === 'text')).toBe(true);
    });

    it('background slide excluded when background is empty/falsy', () => {
      const slides = tmpl.toSlides(makePoetryData({ background: '' }), tmpl.defaultTheme());
      expect(slides.map((s) => s.id)).not.toContain('background');
    });
  });
});

// ═══════════════════════ 4. ReportWeeklyTemplate ════════════════════════════

describe('ReportWeeklyTemplate', () => {
  const tmpl = new ReportWeeklyTemplate();

  describe('defaultTheme', () => {
    it('returns clean report theme with blue accent', () => {
      const theme = tmpl.defaultTheme();
      expect(theme).toHaveProperty('background', '#F8F9FA');
      expect(theme).toHaveProperty('color', '#2C3E50');
      expect(theme).toHaveProperty('accent', '#3498DB');
      expect(typeof theme.fontFamily).toBe('string');
    });
  });

  describe('toSlides', () => {
    it('returns exactly 8 slides', () => {
      const slides = tmpl.toSlides(makeWeeklyData(), tmpl.defaultTheme());
      expect(slides.length).toBe(8);
    });

    it('slide IDs follow expected sequence', () => {
      const slides = tmpl.toSlides(makeWeeklyData(), tmpl.defaultTheme());
      expect(slides.map((s) => s.id)).toEqual([
        'cover',
        'overview',
        'radar',
        'trends',
        'content-review',
        'achievements',
        'insights',
        'recommendations',
      ]);
    });

    it('every slide has valid elements', () => {
      const slides = tmpl.toSlides(makeWeeklyData(), tmpl.defaultTheme());
      slides.forEach((slide) => assertValidSlide(slide, true));
    });

    it('childName propagates to cover slide', () => {
      const slides = tmpl.toSlides(makeWeeklyData({ childName: '甜甜' }), tmpl.defaultTheme());
      expect(textBody(slides[0], 'cover-title')).toContain('甜甜');
    });

    it('period appears in cover-period text element', () => {
      const slides = tmpl.toSlides(
        makeWeeklyData({ period: 'custom-period' }),
        tmpl.defaultTheme(),
      );
      expect(textBody(slides[0], 'cover-period')).toContain('custom-period');
    });

    it('empty dailyStats still produces a table in content-review', () => {
      const slides = tmpl.toSlides(makeWeeklyData({ dailyStats: [] }), tmpl.defaultTheme());
      const reviewSlide = slides.find((s) => s.id === 'content-review');
      expect(reviewSlide!.elements.some((e) => e.type === 'table')).toBe(true);
    });

    it('empty achievements shows placeholder text', () => {
      const slides = tmpl.toSlides(makeWeeklyData({ achievements: [] }), tmpl.defaultTheme());
      const achSlide = slides.find((s) => s.id === 'achievements');
      expect(achSlide!.elements.some((e) => e.type === 'text')).toBe(true);
    });

    it('empty insights shows placeholder text', () => {
      const slides = tmpl.toSlides(makeWeeklyData({ insights: [] }), tmpl.defaultTheme());
      const insightSlide = slides.find((s) => s.id === 'insights');
      expect(insightSlide!.elements.some((e) => e.type === 'text')).toBe(true);
    });

    it('handles realistic full weekly data', () => {
      const data = makeWeeklyData({
        dailyStats: Array.from({ length: 7 }, (_, i) => ({
          date: `2026-01-${String(i + 1).padStart(2, '0')}`,
          totalTime: 300 + i * 60,
          completedLessons: 1 + (i % 3),
          averageScore: 70 + i * 3,
        })),
        skillProgress: { language: 85, math: 75, science: 65, art: 60, social: 70 },
        achievements: [{ name: '全勤宝宝', description: '7 天全勤', earnedAt: '2026-01-07' }],
        insights: ['语言表达进步明显', '数学逻辑有待加强'],
      });
      const slides = tmpl.toSlides(data, tmpl.defaultTheme());
      expect(slides.length).toBe(8);
      slides.forEach((s) => assertValidSlide(s, true));
    });
  });
});

// ═══════════════════════ 5. ReportMonthlyTemplate ═══════════════════════════

describe('ReportMonthlyTemplate', () => {
  const tmpl = new ReportMonthlyTemplate();

  describe('defaultTheme', () => {
    it('returns monthly purple-accent theme', () => {
      const theme = tmpl.defaultTheme();
      expect(theme).toHaveProperty('background', '#F0F4F8');
      expect(theme).toHaveProperty('color', '#2C3E50');
      expect(theme).toHaveProperty('accent', '#8E44AD');
      expect(typeof theme.fontFamily).toBe('string');
    });
  });

  describe('toSlides', () => {
    it('returns exactly 9 slides', () => {
      const slides = tmpl.toSlides(makeMonthlyData(), tmpl.defaultTheme());
      expect(slides.length).toBe(9);
    });

    it('slide IDs follow expected sequence', () => {
      const slides = tmpl.toSlides(makeMonthlyData(), tmpl.defaultTheme());
      expect(slides.map((s) => s.id)).toEqual([
        'cover',
        'overview',
        'week-breakdown',
        'radar',
        'trends',
        'achievements',
        'insights',
        'highlight',
        'recommendations',
      ]);
    });

    it('every slide has valid elements', () => {
      const slides = tmpl.toSlides(makeMonthlyData(), tmpl.defaultTheme());
      slides.forEach((slide) => assertValidSlide(slide, true));
    });

    it('childName propagates to cover slide', () => {
      const slides = tmpl.toSlides(makeMonthlyData({ childName: '小杰' }), tmpl.defaultTheme());
      expect(textBody(slides[0], 'cover-title')).toContain('小杰');
    });

    it('week breakdown table contains week summary rows', () => {
      const slides = tmpl.toSlides(
        makeMonthlyData({
          weekSummaries: [
            { weekLabel: 'Week 1', totalTime: 500, completedLessons: 2, averageScore: 80 },
          ],
        }),
        tmpl.defaultTheme(),
      );
      const wbSlide = slides.find((s) => s.id === 'week-breakdown');
      expect(wbSlide!.elements.some((e) => e.type === 'table')).toBe(true);
      expect(wbSlide!.elements.filter((e) => e.type === 'table')[0]).toHaveProperty('rows');
    });

    it('monthly highlight appears in highlight slide', () => {
      const slides = tmpl.toSlides(
        makeMonthlyData({ monthlyHighlight: '月度亮点内容' }),
        tmpl.defaultTheme(),
      );
      const hlSlide = slides.find((s) => s.id === 'highlight');
      expect(textBody(hlSlide!, 'hl-content')).toContain('月度亮点内容');
    });

    it('handles empty week summaries', () => {
      const slides = tmpl.toSlides(makeMonthlyData({ weekSummaries: [] }), tmpl.defaultTheme());
      expect(slides.length).toBe(9);
      const wbSlide = slides.find((s) => s.id === 'week-breakdown');
      expect(wbSlide!.elements.some((e) => e.type === 'table')).toBe(true);
    });

    it('handles empty trend history', () => {
      const slides = tmpl.toSlides(makeMonthlyData({ trendHistory: [] }), tmpl.defaultTheme());
      expect(slides.length).toBe(9);
    });

    it('handles empty achievements and empty insights', () => {
      const slides = tmpl.toSlides(
        makeMonthlyData({ achievements: [], insights: [] }),
        tmpl.defaultTheme(),
      );
      const achSlide = slides.find((s) => s.id === 'achievements');
      const insightSlide = slides.find((s) => s.id === 'insights');
      expect(achSlide!.elements.some((e) => e.type === 'text')).toBe(true);
      expect(insightSlide!.elements.some((e) => e.type === 'text')).toBe(true);
    });
  });
});

// ═══════════════════════ 6. SemesterReportTemplate ══════════════════════════

describe('SemesterReportTemplate', () => {
  const tmpl = new SemesterReportTemplate();

  describe('defaultTheme', () => {
    it('returns dark gradient theme with red accent', () => {
      const theme = tmpl.defaultTheme();
      expect(theme).toHaveProperty('background');
      expect(theme.background).toContain('linear-gradient');
      expect(theme).toHaveProperty('color', '#E0E6ED');
      expect(theme).toHaveProperty('accent', '#E94560');
      expect(typeof theme.fontFamily).toBe('string');
    });
  });

  describe('toSlides', () => {
    it('returns exactly 7 slides', () => {
      const slides = tmpl.toSlides(makeSemesterData(), tmpl.defaultTheme());
      expect(slides.length).toBe(7);
    });

    it('slide IDs follow expected sequence', () => {
      const slides = tmpl.toSlides(makeSemesterData(), tmpl.defaultTheme());
      expect(slides.map((s) => s.id)).toEqual([
        'semester-cover',
        'semester-overview',
        'semester-monthly',
        'semester-growth',
        'semester-poems',
        'semester-achievements',
        'semester-summary',
      ]);
    });

    it('every slide has valid elements', () => {
      const slides = tmpl.toSlides(makeSemesterData(), tmpl.defaultTheme());
      slides.forEach((slide) => assertValidSlide(slide, true));
    });

    it('childName appears in cover slide', () => {
      const slides = tmpl.toSlides(makeSemesterData({ childName: '安安' }), tmpl.defaultTheme());
      expect(textBody(slides[0], 'cover-name')).toContain('安安');
    });

    it('semester label appears in cover subtitle', () => {
      const slides = tmpl.toSlides(
        makeSemesterData({ semesterLabel: '2026 年秋季学期' }),
        tmpl.defaultTheme(),
      );
      expect(textBody(slides[0], 'cover-subtitle')).toContain('2026 年秋季学期');
    });

    it('teacher summary appears in summary slide', () => {
      const slides = tmpl.toSlides(
        makeSemesterData({ summary: '班主任评语：非常棒！' }),
        tmpl.defaultTheme(),
      );
      expect(textBody(slides[6], 'summary-body')).toContain('班主任评语');
    });

    it('handles empty monthSummaries', () => {
      const slides = tmpl.toSlides(makeSemesterData({ monthSummaries: [] }), tmpl.defaultTheme());
      expect(slides.length).toBe(7);
      const monthlySlide = slides.find((s) => s.id === 'semester-monthly');
      expect(monthlySlide!.elements.length).toBeGreaterThan(0);
    });

    it('handles empty learnedPoems', () => {
      const slides = tmpl.toSlides(makeSemesterData({ learnedPoems: [] }), tmpl.defaultTheme());
      const poemsSlide = slides.find((s) => s.id === 'semester-poems');
      expect(poemsSlide!.elements.some((e) => e.type === 'text')).toBe(true);
    });

    it('handles empty achievements', () => {
      const slides = tmpl.toSlides(makeSemesterData({ achievements: [] }), tmpl.defaultTheme());
      const achSlide = slides.find((s) => s.id === 'semester-achievements');
      expect(achSlide!.elements.some((e) => e.type === 'text')).toBe(true);
    });

    it('handles empty skillGrowth', () => {
      const slides = tmpl.toSlides(makeSemesterData({ skillGrowth: {} }), tmpl.defaultTheme());
      const growthSlide = slides.find((s) => s.id === 'semester-growth');
      expect(growthSlide!.elements.length).toBeGreaterThan(0);
    });

    it('handles many months (12)', () => {
      const months = Array.from({ length: 12 }, (_, i) => ({
        month: `${i + 1}月`,
        totalTime: 7200,
        completedLessons: 20,
        averageScore: 85,
        highlight: `第${i + 1}月亮点`,
        skills: { language: 80, math: 75 },
      }));
      const slides = tmpl.toSlides(
        makeSemesterData({ monthSummaries: months }),
        tmpl.defaultTheme(),
      );
      expect(slides.length).toBe(7);
      const monthlySlide = slides.find((s) => s.id === 'semester-monthly');
      expect(monthlySlide!.elements.length).toBeGreaterThan(10);
    });

    it('handles many poems (20)', () => {
      const poems = Array.from({ length: 20 }, (_, i) => ({
        title: `诗词${i + 1}`,
        author: `诗人${i + 1}`,
      }));
      const slides = tmpl.toSlides(makeSemesterData({ learnedPoems: poems }), tmpl.defaultTheme());
      expect(slides.length).toBe(7);
    });

    it('handles many achievements (20)', () => {
      const achs = Array.from({ length: 20 }, (_, i) => ({
        name: `成就${i + 1}`,
        tier: ['bronze', 'silver', 'gold', 'platinum', 'diamond'][i % 5],
        unlockedAt: '2026-06-30T00:00:00.000Z',
      }));
      const slides = tmpl.toSlides(makeSemesterData({ achievements: achs }), tmpl.defaultTheme());
      expect(slides.length).toBe(7);
    });

    it('every slide has non-empty notes', () => {
      const slides = tmpl.toSlides(makeSemesterData(), tmpl.defaultTheme());
      slides.forEach((slide) => {
        expect(typeof slide.notes).toBe('string');
        expect(slide.notes.length).toBeGreaterThan(0);
      });
    });
  });
});

// ═════════════════ Cross-cutting Invariants ══════════════════════════════════

describe('All Templates: Common Invariants', () => {
  it('all templates implement defaultTheme and toSlides methods', () => {
    const instances = [
      new AchievementTemplate(),
      new LessonPackTemplate(),
      new PoetryTemplate(),
      new ReportWeeklyTemplate(),
      new ReportMonthlyTemplate(),
      new SemesterReportTemplate(),
    ];
    instances.forEach((t) => {
      expect(typeof (t as any).defaultTheme).toBe('function');
      expect(typeof (t as any).toSlides).toBe('function');
    });
  });

  it('all defaultThemes return exactly the 4 required keys', () => {
    const themes = [
      new AchievementTemplate().defaultTheme(),
      new LessonPackTemplate().defaultTheme(),
      new PoetryTemplate().defaultTheme(),
      new ReportWeeklyTemplate().defaultTheme(),
      new ReportMonthlyTemplate().defaultTheme(),
      new SemesterReportTemplate().defaultTheme(),
    ];
    themes.forEach((theme) => {
      expect(Object.keys(theme)).toEqual(['background', 'color', 'accent', 'fontFamily']);
    });
  });
});
