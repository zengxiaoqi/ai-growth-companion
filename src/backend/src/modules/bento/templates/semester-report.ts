import { BentoSlideTemplate, SemesterData } from '../interfaces/bento-template.interface';
import {
  Slide,
  Theme,
  SlideElement,
  TextElement,
  ShapeElement,
} from '../interfaces/bento-document.interface';

const CANVAS_W = 1280;
const MARGIN = 96;
const CONTENT_W = CANVAS_W - MARGIN * 2;
const FONT_STACK = 'Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif';

function text(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  html: string,
  overrides?: Partial<TextElement>,
): TextElement {
  return {
    id,
    type: 'text',
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    html,
    fontSize: 28,
    fontWeight: 400,
    align: 'left',
    valign: 'top',
    color: '#333333',
    fontFamily: FONT_STACK,
    lineHeight: 1.4,
    ...overrides,
  };
}

function shape(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  overrides?: Partial<ShapeElement>,
): ShapeElement {
  return {
    id,
    type: 'shape',
    shape: 'rect',
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    fill,
    stroke: 'none',
    strokeWidth: 0,
    radius: 0,
    ...overrides,
  };
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分钟`;
}

const MONTH_COLORS = ['#4A90D9', '#50C878', '#F5A623', '#D0021B', '#9B59B6', '#1ABC9C'];

export class SemesterReportTemplate implements BentoSlideTemplate<SemesterData> {
  toSlides(data: SemesterData, theme: Theme): Slide[] {
    return [
      this.slideCover(data, theme),
      this.slideOverview(data, theme),
      this.slideMonthlyBreakdown(data, theme),
      this.slideSkillGrowth(data, theme),
      this.slideLearnedPoems(data, theme),
      this.slideAchievements(data, theme),
      this.slideSummary(data, theme),
    ];
  }

  defaultTheme(): Theme {
    return {
      background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
      color: '#E0E6ED',
      accent: '#E94560',
      fontFamily: FONT_STACK,
    };
  }

  private slideCover(data: SemesterData, _theme: Theme): Slide {
    return {
      id: 'semester-cover',
      background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
      transition: 'none',
      notes: `${data.childName} 的 ${data.semesterLabel} 纪念册`,
      elements: [
        shape('cover-deco-1', 50, 40, 180, 180, 'rgba(233,69,96,0.06)', { shape: 'ellipse' }),
        shape('cover-deco-2', 900, 350, 250, 250, 'rgba(233,69,96,0.04)', { shape: 'ellipse' }),
        shape('cover-deco-3', 200, 500, 120, 120, 'rgba(233,69,96,0.03)', { shape: 'ellipse' }),
        text('cover-title', MARGIN, 160, CONTENT_W, 80, '📖 成长纪念册', {
          fontSize: 60,
          fontWeight: 800,
          align: 'center',
          color: '#E94560',
        }),
        text('cover-subtitle', MARGIN, 250, CONTENT_W, 50, data.semesterLabel, {
          fontSize: 36,
          fontWeight: 600,
          align: 'center',
          color: '#E0E6ED',
        }),
        text('cover-name', MARGIN, 320, CONTENT_W, 40, data.childName, {
          fontSize: 28,
          fontWeight: 500,
          align: 'center',
          color: '#8899AA',
        }),
        text('cover-date', MARGIN, 370, CONTENT_W, 35, `${data.startDate} ~ ${data.endDate}`, {
          fontSize: 20,
          fontWeight: 400,
          align: 'center',
          color: '#667788',
        }),
        // 分隔线
        shape('cover-line', 440, 430, 400, 2, 'rgba(233,69,96,0.3)', { radius: 1 }),
        text(
          'cover-stats',
          MARGIN,
          460,
          CONTENT_W,
          35,
          `学习 ${formatTime(data.totalLearningTime)} · 完成 ${data.totalLessonsCompleted} 课 · 出勤 ${data.totalDaysStudied} 天`,
          {
            fontSize: 18,
            fontWeight: 400,
            align: 'center',
            color: '#8899AA',
          },
        ),
      ],
    };
  }

  private slideOverview(data: SemesterData, theme: Theme): Slide {
    return {
      id: 'semester-overview',
      background: theme.background,
      transition: 'morph',
      notes: '学期概览',
      elements: [
        text('overview-title', MARGIN, 50, 400, 50, '📊 学期概览', {
          fontSize: 28,
          fontWeight: 700,
          color: '#E0E6ED',
        }),
        // 统计卡片
        ...this.statCard(
          'card-time',
          100,
          140,
          '学习时长',
          formatTime(data.totalLearningTime),
          '#E94560',
        ),
        ...this.statCard(
          'card-lessons',
          400,
          140,
          '完成课程',
          `${data.totalLessonsCompleted}课`,
          '#4A90D9',
        ),
        ...this.statCard('card-score', 700, 140, '平均分', `${data.averageScore}分`, '#50C878'),
        ...this.statCard(
          'card-days',
          1000,
          140,
          '学习天数',
          `${data.totalDaysStudied}天`,
          '#F5A623',
        ),
        // 技能成长条
        text('overview-skills', MARGIN, 280, 300, 40, '📈 技能成长', {
          fontSize: 24,
          fontWeight: 600,
          color: '#E0E6ED',
        }),
        ...this.buildSkillGrowthBars(data.skillGrowth, 300),
      ],
    };
  }

  private statCard(
    id: string,
    x: number,
    y: number,
    label: string,
    value: string,
    accent: string,
  ): SlideElement[] {
    return [
      shape(`${id}-bg`, x, y, 260, 110, 'rgba(255,255,255,0.06)', {
        radius: 16,
        stroke: 'rgba(255,255,255,0.08)',
        strokeWidth: 1,
      }),
      shape(`${id}-accent`, x, y, 260, 4, accent, { radius: 2 }),
      text(`${id}-val`, x, y + 20, 260, 45, value, {
        fontSize: 32,
        fontWeight: 800,
        align: 'center',
        color: accent,
      }),
      text(`${id}-lbl`, x, y + 70, 260, 30, label, {
        fontSize: 16,
        fontWeight: 400,
        align: 'center',
        color: '#8899AA',
      }),
    ];
  }

  private buildSkillGrowthBars(
    skills: Record<string, { start: number; end: number }>,
    startY: number,
  ): SlideElement[] {
    const elements: SlideElement[] = [];
    const labels: Record<string, string> = {
      language: '语言',
      math: '数学',
      science: '科学',
      art: '美术',
      social: '社交',
    };
    const entries = Object.entries(skills);
    const barArea = CONTENT_W - 100;

    entries.forEach(([key, growth], i) => {
      const y = startY + i * 60;
      const label = labels[key] || key;
      elements.push(
        text(`skill-label-${key}`, MARGIN, y, 80, 30, label, {
          fontSize: 18,
          fontWeight: 600,
          color: '#E0E6ED',
        }),
      );
      // 起始值条
      elements.push(
        shape(`skill-start-bg-${key}`, MARGIN + 90, y + 4, barArea, 22, 'rgba(255,255,255,0.08)', {
          radius: 11,
        }),
        shape(
          `skill-start-${key}`,
          MARGIN + 90,
          y + 4,
          barArea * (growth.start / 100),
          22,
          '#4A90D9',
          { radius: 11 },
        ),
      );
      // 增长量条
      const growthAmount = Math.max(0, growth.end - growth.start);
      if (growthAmount > 0) {
        elements.push(
          shape(
            `skill-growth-${key}`,
            MARGIN + 90 + barArea * (growth.start / 100),
            y + 4,
            barArea * (growthAmount / 100),
            22,
            '#E94560',
            { radius: 11 },
          ),
        );
      }
      elements.push(
        text(
          `skill-end-${key}`,
          MARGIN + 90 + barArea + 10,
          y,
          60,
          30,
          `${growth.start}% → ${growth.end}%`,
          {
            fontSize: 16,
            fontWeight: 600,
            color: '#8899AA',
          },
        ),
      );
    });

    return elements;
  }

  private slideMonthlyBreakdown(data: SemesterData, theme: Theme): Slide {
    return {
      id: 'semester-monthly',
      background: theme.background,
      transition: 'morph',
      notes: '每月回顾',
      elements: [
        text('monthly-title', MARGIN, 50, 400, 50, '📅 每月回顾', {
          fontSize: 28,
          fontWeight: 700,
          color: '#E0E6ED',
        }),
        ...data.monthSummaries.flatMap((m, i) => {
          const y = 130 + i * 100;
          const color = MONTH_COLORS[i % MONTH_COLORS.length];
          return [
            shape(`month-bar-${i}`, MARGIN - 5, y - 5, 4, 80, color, { radius: 2 }),
            text(`month-name-${i}`, MARGIN + 15, y, 80, 30, m.month, {
              fontSize: 22,
              fontWeight: 700,
              color,
            }),
            text(
              `month-stats-${i}`,
              MARGIN + 15,
              y + 30,
              300,
              25,
              `${formatTime(m.totalTime)} · ${m.completedLessons}课 · 均分${m.averageScore}`,
              {
                fontSize: 16,
                fontWeight: 400,
                color: '#8899AA',
              },
            ),
            text(`month-highlight-${i}`, MARGIN + 350, y + 5, 500, 50, m.highlight, {
              fontSize: 18,
              fontWeight: 400,
              color: '#E0E6ED',
            }),
          ];
        }),
      ],
    };
  }

  private slideSkillGrowth(data: SemesterData, theme: Theme): Slide {
    const labels: Record<string, string> = {
      language: '语言',
      math: '数学',
      science: '科学',
      art: '美术',
      social: '社交',
    };
    const entries = Object.entries(data.skillGrowth);

    const elements: SlideElement[] = [
      text('growth-title', MARGIN, 50, 400, 50, '📈 能力成长曲线', {
        fontSize: 28,
        fontWeight: 700,
        color: '#E0E6ED',
      }),
    ];

    // 表格形式展示起止点
    const headerColor = '#E94560';
    const rowColor = 'rgba(255,255,255,0.06)';

    // 表头
    elements.push(
      shape('growth-header', MARGIN, 120, CONTENT_W, 45, 'rgba(233,69,96,0.15)', { radius: 8 }),
      text('g-h-name', MARGIN, 125, 180, 35, '能力维度', {
        fontSize: 18,
        fontWeight: 700,
        align: 'center',
        color: headerColor,
      }),
      text('g-h-start', MARGIN + 190, 125, 120, 35, '学期初', {
        fontSize: 18,
        fontWeight: 700,
        align: 'center',
        color: headerColor,
      }),
      text('g-h-end', MARGIN + 320, 125, 120, 35, '学期末', {
        fontSize: 18,
        fontWeight: 700,
        align: 'center',
        color: headerColor,
      }),
      text('g-h-growth', MARGIN + 450, 125, 120, 35, '增长', {
        fontSize: 18,
        fontWeight: 700,
        align: 'center',
        color: headerColor,
      }),
      text('g-h-bar', MARGIN + 580, 125, 400, 35, '进度', {
        fontSize: 18,
        fontWeight: 700,
        align: 'center',
        color: headerColor,
      }),
    );

    entries.forEach(([key, growth], i) => {
      const y = 175 + i * 55;
      const label = labels[key] || key;
      const growthAmount = Math.max(0, growth.end - growth.start);
      const barArea = 390;

      elements.push(
        shape(`g-row-${i}`, MARGIN, y, CONTENT_W, 45, i % 2 === 0 ? rowColor : 'transparent', {
          radius: 4,
        }),
        text(`g-name-${i}`, MARGIN + 5, y + 5, 180, 35, label, {
          fontSize: 18,
          fontWeight: 600,
          color: '#E0E6ED',
          align: 'center',
        }),
        text(`g-start-${i}`, MARGIN + 190, y + 5, 120, 35, `${growth.start}%`, {
          fontSize: 18,
          fontWeight: 400,
          color: '#8899AA',
          align: 'center',
        }),
        text(`g-end-${i}`, MARGIN + 320, y + 5, 120, 35, `${growth.end}%`, {
          fontSize: 18,
          fontWeight: 700,
          color: '#50C878',
          align: 'center',
        }),
        text(`g-growth-${i}`, MARGIN + 450, y + 5, 120, 35, `+${growthAmount}`, {
          fontSize: 18,
          fontWeight: 700,
          color: growthAmount > 0 ? '#E94560' : '#8899AA',
          align: 'center',
        }),
        // 进度条
        shape(`g-bar-bg-${i}`, MARGIN + 580, y + 10, barArea, 25, 'rgba(255,255,255,0.08)', {
          radius: 12,
        }),
        shape(
          `g-bar-start-${i}`,
          MARGIN + 580,
          y + 10,
          barArea * (growth.start / 100),
          25,
          '#4A90D9',
          { radius: 12 },
        ),
        ...(growthAmount > 0
          ? [
              shape(
                `g-bar-growth-${i}`,
                MARGIN + 580 + barArea * (growth.start / 100),
                y + 10,
                barArea * (growthAmount / 100),
                25,
                '#E94560',
                { radius: 12 },
              ),
            ]
          : []),
      );
    });

    return {
      id: 'semester-growth',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '能力成长',
    };
  }

  private slideLearnedPoems(data: SemesterData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('poems-title', MARGIN, 50, 400, 50, '📖 学过的诗词', {
        fontSize: 28,
        fontWeight: 700,
        color: '#E0E6ED',
      }),
      text('poems-count', MARGIN, 100, 400, 30, `共学习了 ${data.learnedPoems.length} 首诗词`, {
        fontSize: 20,
        fontWeight: 400,
        color: '#8899AA',
      }),
    ];

    const pageSize = 12;
    const poems = data.learnedPoems.slice(0, pageSize);
    poems.forEach((poem, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * 540;
      const y = 150 + row * 50;
      elements.push(
        shape(`poem-bg-${i}`, x, y, 520, 40, 'rgba(255,255,255,0.04)', { radius: 8 }),
        text(`poem-title-${i}`, x + 15, y + 5, 350, 30, `《${poem.title}》`, {
          fontSize: 18,
          fontWeight: 600,
          color: '#E0E6ED',
        }),
        text(`poem-author-${i}`, x + 380, y + 5, 130, 30, poem.author, {
          fontSize: 16,
          fontWeight: 400,
          color: '#8899AA',
          align: 'right',
        }),
      );
    });

    return {
      id: 'semester-poems',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '学过的诗词',
    };
  }

  private slideAchievements(data: SemesterData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('ach-title', MARGIN, 50, 400, 50, '🏆 解锁成就', {
        fontSize: 28,
        fontWeight: 700,
        color: '#E0E6ED',
      }),
      text('ach-count', MARGIN, 100, 400, 30, `本学期解锁了 ${data.achievements.length} 个成就`, {
        fontSize: 20,
        fontWeight: 400,
        color: '#8899AA',
      }),
    ];

    const TIER_COLORS: Record<string, string> = {
      bronze: '#CD7F32',
      silver: '#C0C0C0',
      gold: '#FFD700',
      platinum: '#E5E4E2',
      diamond: '#B9F2FF',
    };
    const TIER_LABELS: Record<string, string> = {
      bronze: '青铜',
      silver: '白银',
      gold: '黄金',
      platinum: '铂金',
      diamond: '钻石',
    };

    const pageSize = 8;
    const achievements = data.achievements.slice(0, pageSize);
    achievements.forEach((ach, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * 540;
      const y = 150 + row * 60;
      const color = TIER_COLORS[ach.tier] || '#E0E6ED';

      elements.push(
        shape(`ach-bg-${i}`, x, y, 520, 50, 'rgba(255,255,255,0.04)', {
          radius: 10,
          stroke: color,
          strokeWidth: 1,
        }),
        text(`ach-name-${i}`, x + 15, y + 5, 350, 25, ach.name, {
          fontSize: 18,
          fontWeight: 600,
          color,
        }),
        text(`ach-tier-${i}`, x + 15, y + 28, 150, 20, TIER_LABELS[ach.tier] || ach.tier, {
          fontSize: 14,
          fontWeight: 400,
          color: '#8899AA',
        }),
        text(`ach-date-${i}`, x + 380, y + 10, 130, 25, ach.unlockedAt?.slice(0, 10) || '', {
          fontSize: 14,
          fontWeight: 400,
          color: '#667788',
          align: 'right',
        }),
      );
    });

    return {
      id: 'semester-achievements',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '成就',
    };
  }

  private slideSummary(data: SemesterData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      // 装饰
      shape('summary-deco', 340, 100, 600, 400, 'rgba(233,69,96,0.03)', { shape: 'ellipse' }),
      text('summary-title', MARGIN, 120, CONTENT_W, 60, '💌 班主任寄语', {
        fontSize: 36,
        fontWeight: 700,
        align: 'center',
        color: '#E94560',
      }),
      // 寄语卡片
      shape('summary-card', MARGIN, 200, CONTENT_W, 280, 'rgba(255,255,255,0.04)', {
        radius: 20,
        stroke: 'rgba(233,69,96,0.2)',
        strokeWidth: 1,
      }),
      text('summary-quote', MARGIN + 40, 220, 40, 40, '❝', {
        fontSize: 36,
        fontWeight: 400,
        color: 'rgba(233,69,96,0.3)',
      }),
      text('summary-body', MARGIN + 60, 260, CONTENT_W - 120, 180, data.summary, {
        fontSize: 24,
        fontWeight: 500,
        align: 'center',
        color: '#E0E6ED',
        lineHeight: 1.8,
      }),
      text('summary-quote-end', MARGIN + CONTENT_W - 80, 420, 40, 40, '❞', {
        fontSize: 36,
        fontWeight: 400,
        color: 'rgba(233,69,96,0.3)',
      }),
      // 底部寄语
      text(
        'summary-footer',
        MARGIN,
        520,
        CONTENT_W,
        40,
        `—— ${data.childName} 的 ${data.semesterLabel} · 继续加油 💪`,
        {
          fontSize: 20,
          fontWeight: 400,
          align: 'center',
          color: '#667788',
        },
      ),
    ];

    return {
      id: 'semester-summary',
      background: theme.background,
      transition: 'none',
      elements,
      notes: '班主任寄语',
    };
  }
}
