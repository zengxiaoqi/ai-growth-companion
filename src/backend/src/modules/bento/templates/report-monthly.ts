import { BentoSlideTemplate, MonthlyReportData } from '../interfaces/bento-template.interface';
import {
  Slide,
  Theme,
  SlideElement,
  TextElement,
  ShapeElement,
  TableElement,
  TableStyle,
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

function bentoTable(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  columnWeights: number[],
  rows: string[][],
  header: boolean,
  style: Partial<TableStyle>,
): TableElement {
  return {
    id,
    type: 'table',
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    columns: columnWeights.map((w) => ({ w })),
    rows: rows.map((row) => ({ cells: row.map((cellHtml) => ({ html: cellHtml })) })),
    header,
    style: {
      headerBg: '#3498DB',
      headerColor: '#FFFFFF',
      zebra: 'rgba(52,152,219,0.05)',
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      cellPadX: 12,
      cellPadY: 10,
      fontSize: 18,
      fontFamily: FONT_STACK,
      color: '#2C3E50',
      radius: 8,
      ...style,
    },
  };
}

const DOMAIN_LABELS: Record<string, string> = {
  language: '语言表达',
  math: '数学逻辑',
  science: '科学探索',
  art: '艺术创造',
  social: '社会交往',
};
const DOMAIN_ORDER = ['language', 'math', 'science', 'art', 'social'];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}分钟`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}小时${remainMins}分钟` : `${hours}小时`;
}

export class ReportMonthlyTemplate implements BentoSlideTemplate<MonthlyReportData> {
  toSlides(data: MonthlyReportData, theme: Theme): Slide[] {
    return [
      this.slideCover(data, theme),
      this.slideOverview(data, theme),
      this.slideWeekBreakdown(data, theme),
      this.slideRadar(data, theme),
      this.slideTrendChart(data, theme),
      this.slideAchievements(data, theme),
      this.slideInsights(data, theme),
      this.slideHighlight(data, theme),
      this.slideRecommendations(data, theme),
    ];
  }

  defaultTheme(): Theme {
    return {
      background: '#F0F4F8',
      color: '#2C3E50',
      accent: '#8E44AD', // 月报用紫色调
      fontFamily: FONT_STACK,
    };
  }

  private slideCover(data: MonthlyReportData, theme: Theme): Slide {
    return {
      id: 'cover',
      background: `linear-gradient(135deg, ${theme.accent} 0%, #4A235A 100%)`,
      transition: 'none',
      notes: `${data.childName} ${data.period} 月度学习报告`,
      elements: [
        shape('cover-deco-1', 80, 40, 180, 180, 'rgba(255,255,255,0.08)', { shape: 'ellipse' }),
        shape('cover-deco-2', 950, 420, 250, 250, 'rgba(255,255,255,0.06)', { shape: 'ellipse' }),
        text('cover-title', MARGIN, 230, CONTENT_W, 80, `📅 ${data.childName} 的月度报告`, {
          fontSize: 52,
          fontWeight: 700,
          align: 'center',
          color: '#FFFFFF',
        }),
        text('cover-period', MARGIN, 330, CONTENT_W, 50, `报告周期: ${data.period}`, {
          fontSize: 28,
          fontWeight: 400,
          align: 'center',
          color: 'rgba(255,255,255,0.85)',
        }),
        text('cover-encourage', MARGIN, 410, CONTENT_W, 60, data.encouragement, {
          fontSize: 32,
          fontWeight: 500,
          align: 'center',
          color: 'rgba(255,255,255,0.9)',
        }),
      ],
    };
  }

  private slideOverview(data: MonthlyReportData, theme: Theme): Slide {
    const stats = [
      { label: '总学习时长', value: formatDuration(data.totalLearningTime) },
      { label: '完成课程', value: `${data.totalLessonsCompleted} 课` },
      { label: '平均分', value: `${data.averageScore} 分` },
      { label: '连续学习', value: `${data.streak} 天` },
    ];
    const elements: SlideElement[] = [
      text('overview-title', MARGIN, 50, 400, 60, '📊 月度概览', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('overview-sub', MARGIN, 110, 600, 40, '本月学习成果一览', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];
    stats.forEach((stat, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * 340;
      const y = 180 + row * 200;
      elements.push(
        shape(`overview-card-${i}`, x - 10, y - 15, 300, 130, '#FFFFFF', {
          radius: 16,
          shadow: { x: 0, y: 2, blur: 12, color: 'rgba(0,0,0,0.08)' },
        }),
        text(`overview-label-${i}`, x, y, 280, 40, stat.label, {
          fontSize: 18,
          fontWeight: 500,
          color: '#7F8C8D',
        }),
        text(`overview-value-${i}`, x, y + 40, 280, 60, stat.value, {
          fontSize: 42,
          fontWeight: 700,
          color: theme.accent,
        }),
      );
    });
    return {
      id: 'overview',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '月度学习概览',
    };
  }

  private slideWeekBreakdown(data: MonthlyReportData, theme: Theme): Slide {
    const rows = data.weekSummaries.map((w) => [
      w.weekLabel,
      formatDuration(w.totalTime),
      `${w.completedLessons} 课`,
      `${w.averageScore} 分`,
    ]);
    const elements: SlideElement[] = [
      text('wb-title', MARGIN, 50, 400, 60, '📆 每周分解', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('wb-sub', MARGIN, 110, 600, 40, '本月各周学习情况', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
      bentoTable(
        'wb-table',
        MARGIN,
        180,
        700,
        Math.min(400, rows.length * 50 + 40),
        [1, 1.2, 1, 1],
        rows,
        true,
        { headerBg: theme.accent, headerColor: '#FFFFFF' },
      ),
    ];
    return {
      id: 'week-breakdown',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '每周学习分解',
    };
  }

  private slideRadar(data: MonthlyReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('radar-title', MARGIN, 50, 400, 60, '🎯 月度能力雷达', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('radar-sub', MARGIN, 110, 600, 40, '各维度能力综合评估', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];
    DOMAIN_ORDER.forEach((domain, i) => {
      const score = data.skillProgress[domain] || 0;
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = MARGIN + col * 380;
      const cy = 210 + row * 200;
      elements.push(
        text(`radar-label-${domain}`, cx, cy, 300, 35, DOMAIN_LABELS[domain] || domain, {
          fontSize: 22,
          fontWeight: 600,
          color: theme.color,
        }),
        shape(`radar-bg-${domain}`, cx, cy + 40, 300, 26, '#ECF0F1', { radius: 13 }),
        ...(score > 0
          ? [
              shape(`radar-fill-${domain}`, cx, cy + 40, 300 * (score / 100), 26, theme.accent, {
                radius: 13,
              }),
            ]
          : []),
        text(`radar-score-${domain}`, cx + 310, cy + 40, 60, 30, `${score}`, {
          fontSize: 22,
          fontWeight: 700,
          color: theme.accent,
          align: 'right',
        }),
      );
    });
    return {
      id: 'radar',
      background: theme.background,
      transition: 'morph',
      notes: '月度能力雷达',
      elements,
    };
  }

  private slideTrendChart(data: MonthlyReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('trend-title', MARGIN, 50, 400, 60, '📈 月度趋势', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('trend-sub', MARGIN, 110, 600, 40, '各科能力变化的月度趋势', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    // 表格：每行 = 一周，每列 = 一个领域
    const rows = data.trendHistory.map((t) => [
      t.label,
      ...DOMAIN_ORDER.map((d) => `${t[d] || 0}`),
    ]);

    elements.push(
      bentoTable(
        'trend-table',
        MARGIN,
        180,
        900,
        Math.min(400, rows.length * 50 + 40),
        [0.8, 1, 1, 1, 1, 1],
        rows,
        true,
        { headerBg: theme.accent, headerColor: '#FFFFFF', fontSize: 16 },
      ),
    );
    return {
      id: 'trends',
      background: theme.background,
      transition: 'morph',
      notes: '月度趋势',
      elements,
    };
  }

  private slideAchievements(data: MonthlyReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('ach-title', MARGIN, 50, 400, 60, '🏆 月度成就', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('ach-sub', MARGIN, 110, 600, 40, `本月共获得 ${data.achievements.length} 个成就`, {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];
    if (data.achievements.length === 0) {
      elements.push(
        text('ach-empty', MARGIN, 200, 500, 50, '本月还没有获得新成就，继续加油哦！', {
          fontSize: 24,
          fontWeight: 500,
          color: '#95A5A6',
        }),
      );
    } else {
      data.achievements.forEach((ach, i) => {
        const y = 190 + i * 90;
        elements.push(
          shape(`ach-card-${i}`, MARGIN - 10, y - 8, 600, 75, '#FFFFFF', {
            radius: 12,
            shadow: { x: 0, y: 1, blur: 6, color: 'rgba(0,0,0,0.06)' },
          }),
          text(`ach-emoji-${i}`, MARGIN, y, 50, 50, '⭐', { fontSize: 32, align: 'center' }),
          text(`ach-name-${i}`, MARGIN + 60, y, 500, 35, ach.name, {
            fontSize: 24,
            fontWeight: 600,
            color: theme.color,
          }),
          text(`ach-desc-${i}`, MARGIN + 60, y + 35, 500, 30, ach.description, {
            fontSize: 18,
            fontWeight: 400,
            color: '#7F8C8D',
          }),
        );
      });
    }
    return {
      id: 'achievements',
      background: theme.background,
      transition: 'morph',
      notes: '月度成就',
      elements,
    };
  }

  private slideInsights(data: MonthlyReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('insight-title', MARGIN, 50, 400, 60, '🤖 AI 月度洞察', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('insight-sub', MARGIN, 110, 600, 40, '基于本月学习数据的个性化分析', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];
    if (data.insights.length === 0) {
      elements.push(
        text('insight-empty', MARGIN, 200, 700, 50, '暂无洞察数据，持续学习后将生成个性化建议。', {
          fontSize: 24,
          fontWeight: 500,
          color: '#95A5A6',
        }),
      );
    } else {
      data.insights.forEach((insight, i) => {
        const y = 190 + i * 100;
        elements.push(
          shape(`insight-dot-${i}`, MARGIN, y + 6, 28, 28, theme.accent, { shape: 'ellipse' }),
          text(`insight-num-${i}`, MARGIN + 2, y + 2, 24, 24, `${i + 1}`, {
            fontSize: 14,
            fontWeight: 700,
            color: '#FFFFFF',
            align: 'center',
          }),
          text(`insight-text-${i}`, MARGIN + 40, y, 700, 80, insight, {
            fontSize: 24,
            fontWeight: 400,
            color: theme.color,
            lineHeight: 1.5,
          }),
        );
      });
    }
    return {
      id: 'insights',
      background: theme.background,
      transition: 'morph',
      notes: 'AI 月度洞察',
      elements,
    };
  }

  private slideHighlight(data: MonthlyReportData, theme: Theme): Slide {
    return {
      id: 'highlight',
      background: `linear-gradient(135deg, ${theme.accent} 0%, #4A235A 100%)`,
      transition: 'morph',
      notes: '本月亮点',
      elements: [
        text('hl-title', MARGIN, 120, CONTENT_W, 60, '🌟 本月亮点', {
          fontSize: 40,
          fontWeight: 700,
          align: 'center',
          color: '#FFFFFF',
        }),
        text('hl-content', MARGIN, 220, CONTENT_W, 300, data.monthlyHighlight, {
          fontSize: 28,
          fontWeight: 400,
          align: 'center',
          color: 'rgba(255,255,255,0.92)',
          lineHeight: 1.8,
        }),
      ],
    };
  }

  private slideRecommendations(data: MonthlyReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('rec-title', MARGIN, 50, 400, 60, '🚀 下月推荐', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('rec-sub', MARGIN, 110, 600, 40, '下月学习建议', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    let weakestDomain = 'language';
    let weakestScore = Infinity;
    for (const [domain, score] of Object.entries(data.skillProgress)) {
      if (score < weakestScore) {
        weakestScore = score;
        weakestDomain = domain;
      }
    }

    const recommendations = [
      `建议每天安排 ${formatDuration(Math.max(1800, Math.round(data.totalLearningTime / 7)))} 的学习时间，保持学习节奏。`,
      `重点关注 ${DOMAIN_LABELS[weakestDomain] || weakestDomain} 领域（当前 ${weakestScore} 分），可适当增加练习。`,
      '尝试不同类型的知识点，拓展学习广度。',
      `保持每月学习频率，持续进步！`,
    ];

    recommendations.forEach((rec, i) => {
      const y = 190 + i * 110;
      elements.push(
        shape(`rec-bar-${i}`, MARGIN, y, 4, 60, theme.accent, { radius: 2 }),
        text(`rec-text-${i}`, MARGIN + 20, y, 700, 80, rec, {
          fontSize: 22,
          fontWeight: 400,
          color: theme.color,
          lineHeight: 1.5,
        }),
      );
    });

    return {
      id: 'recommendations',
      background: theme.background,
      transition: 'morph',
      notes: '下月推荐',
      elements,
    };
  }
}
