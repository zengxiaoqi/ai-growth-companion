import { BentoSlideTemplate, ReportData } from '../interfaces/bento-template.interface';
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
const _CANVAS_H = 720;
const MARGIN = 96;
const CONTENT_W = CANVAS_W - MARGIN * 2; // 1088

// 中文字体系统栈
const FONT_STACK = 'Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif';

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

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
  rows: string[][], // 2D array of cell text
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
    rows: rows.map((row) => ({
      cells: row.map((cellHtml) => ({ html: cellHtml })),
    })),
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

// ─── 模板类 ─────────────────────────────────────────────────────────────────

export class ReportWeeklyTemplate implements BentoSlideTemplate<ReportData> {
  toSlides(data: ReportData, theme: Theme): Slide[] {
    return [
      this.slideCover(data, theme),
      this.slideOverview(data, theme),
      this.slideRadar(data, theme),
      this.slideTrends(data, theme),
      this.slideContentReview(data, theme),
      this.slideAchievements(data, theme),
      this.slideInsights(data, theme),
      this.slideRecommendations(data, theme),
    ];
  }

  defaultTheme(): Theme {
    return {
      background: '#F8F9FA',
      color: '#2C3E50',
      accent: '#3498DB',
      fontFamily: FONT_STACK,
    };
  }

  // ── 封面 ──

  private slideCover(data: ReportData, theme: Theme): Slide {
    const accent = theme.accent;
    return {
      id: 'cover',
      background: `linear-gradient(135deg, ${accent} 0%, #1a5276 100%)`,
      transition: 'none',
      notes: `${data.childName} ${data.period}学习报告封面`,
      elements: [
        // 装饰圆
        shape('cover-deco-1', 100, 50, 200, 200, 'rgba(255,255,255,0.08)', { shape: 'ellipse' }),
        shape('cover-deco-2', 900, 400, 300, 300, 'rgba(255,255,255,0.06)', { shape: 'ellipse' }),
        text('cover-title', MARGIN, 260, CONTENT_W, 80, `${data.childName} 的学习报告`, {
          fontSize: 56,
          fontWeight: 700,
          align: 'center',
          color: '#FFFFFF',
        }),
        text('cover-period', MARGIN, 360, CONTENT_W, 50, `报告周期: ${data.period}`, {
          fontSize: 28,
          fontWeight: 400,
          align: 'center',
          color: 'rgba(255,255,255,0.85)',
        }),
        text('cover-encourage', MARGIN, 440, CONTENT_W, 60, data.encouragement, {
          fontSize: 32,
          fontWeight: 500,
          align: 'center',
          color: 'rgba(255,255,255,0.9)',
        }),
      ],
    };
  }

  // ── 概览 ──

  private slideOverview(data: ReportData, theme: Theme): Slide {
    const stats = [
      { label: '学习时长', value: formatDuration(data.totalLearningTime) },
      { label: '完成课程', value: `${data.totalLessonsCompleted} 课` },
      { label: '平均分', value: `${data.averageScore} 分` },
      { label: '连续学习', value: `${data.streak} 天` },
    ];

    const elements: SlideElement[] = [
      text('overview-title', MARGIN, 50, 400, 60, '📊 本周概览', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('overview-sub', MARGIN, 110, 600, 40, `${data.childName} 的学习数据一览`, {
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
      // 卡片背景
      elements.push(
        shape(`overview-card-${i}`, x - 10, y - 15, 300, 130, '#FFFFFF', {
          radius: 16,
          shadow: { x: 0, y: 2, blur: 12, color: 'rgba(0,0,0,0.08)' },
        }),
      );
      elements.push(
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
      notes: '学习概览：总时长、完成课程、平均分、连续学习天数',
      elements,
    };
  }

  // ── 能力雷达（用 Shape 元素绘制进度条，非 text+style）──

  private slideRadar(data: ReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('radar-title', MARGIN, 50, 400, 60, '🎯 能力雷达', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('radar-sub', MARGIN, 110, 600, 40, '各维度能力评估', {
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

      // 标签
      elements.push(
        text(`radar-label-${domain}`, cx, cy, 300, 35, DOMAIN_LABELS[domain] || domain, {
          fontSize: 22,
          fontWeight: 600,
          color: theme.color,
        }),
      );
      // 进度条背景
      elements.push(shape(`radar-bg-${domain}`, cx, cy + 40, 300, 26, '#ECF0F1', { radius: 13 }));
      // 进度条填充（用 shape 代替 text+style）
      if (score > 0) {
        elements.push(
          shape(`radar-fill-${domain}`, cx, cy + 40, 300 * (score / 100), 26, theme.accent, {
            radius: 13,
          }),
        );
      }
      // 分数
      elements.push(
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
      notes: '各维度能力雷达图',
      elements,
    };
  }

  // ── 各科趋势（表格）──

  private slideTrends(data: ReportData, theme: Theme): Slide {
    const rows = DOMAIN_ORDER.map((d) => [
      DOMAIN_LABELS[d] || d,
      `${data.skillProgress[d] || 0} 分`,
    ]);

    const elements: SlideElement[] = [
      text('trends-title', MARGIN, 50, 400, 60, '📈 各科趋势', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('trends-sub', MARGIN, 110, 600, 40, '本周各领域能力分数', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
      bentoTable('trends-table', MARGIN, 180, 600, 350, [2, 1], rows, true, {
        headerBg: theme.accent,
        headerColor: '#FFFFFF',
      }),
    ];

    return {
      id: 'trends',
      background: theme.background,
      transition: 'morph',
      notes: '各科能力分数对比',
      elements,
    };
  }

  // ── 学习内容回顾 ──

  private slideContentReview(data: ReportData, theme: Theme): Slide {
    const rows = data.dailyStats.map((d) => [
      d.date.slice(5),
      formatDuration(d.totalTime),
      `${d.completedLessons} 课`,
      `${d.averageScore} 分`,
    ]);

    const elements: SlideElement[] = [
      text('review-title', MARGIN, 50, 400, 60, '📚 学习内容回顾', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('review-sub', MARGIN, 110, 600, 40, '每日学习情况一览', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
      bentoTable(
        'review-table',
        MARGIN,
        180,
        700,
        Math.min(400, rows.length * 50 + 40),
        [1.2, 1.2, 1, 1],
        rows,
        true,
        { headerBg: theme.accent, headerColor: '#FFFFFF' },
      ),
    ];

    return {
      id: 'content-review',
      background: theme.background,
      transition: 'morph',
      notes: '每日学习情况',
      elements,
    };
  }

  // ── 成就墙 ──

  private slideAchievements(data: ReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('ach-title', MARGIN, 50, 400, 60, '🏆 成就墙', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('ach-sub', MARGIN, 110, 600, 40, `本周共获得 ${data.achievements.length} 个成就`, {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    if (data.achievements.length === 0) {
      elements.push(
        text('ach-empty', MARGIN, 200, 500, 50, '本周还没有获得新成就，继续加油哦！', {
          fontSize: 24,
          fontWeight: 500,
          color: '#95A5A6',
        }),
      );
    } else {
      data.achievements.forEach((ach, i) => {
        const y = 190 + i * 90;
        // 成就卡片背景
        elements.push(
          shape(`ach-card-${i}`, MARGIN - 10, y - 8, 600, 75, '#FFFFFF', {
            radius: 12,
            shadow: { x: 0, y: 1, blur: 6, color: 'rgba(0,0,0,0.06)' },
          }),
        );
        elements.push(
          text(`ach-emoji-${i}`, MARGIN, y, 50, 50, '⭐', {
            fontSize: 32,
            fontWeight: 400,
            align: 'center',
          }),
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
      notes: '成就墙',
      elements,
    };
  }

  // ── AI 洞察 ──

  private slideInsights(data: ReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('insight-title', MARGIN, 50, 400, 60, '🤖 AI 洞察', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('insight-sub', MARGIN, 110, 600, 40, '基于学习数据的个性化分析', {
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
        // 索引圆点
        elements.push(
          shape(`insight-dot-${i}`, MARGIN, y + 6, 28, 28, theme.accent, { shape: 'ellipse' }),
        );
        elements.push(
          text(`insight-num-${i}`, MARGIN + 2, y + 2, 24, 24, `${i + 1}`, {
            fontSize: 14,
            fontWeight: 700,
            color: '#FFFFFF',
            align: 'center',
          }),
        );
        elements.push(
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
      notes: 'AI 个性化洞察',
      elements,
    };
  }

  // ── 推荐内容 ──

  private slideRecommendations(data: ReportData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      text('rec-title', MARGIN, 50, 400, 60, '🚀 推荐内容', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text('rec-sub', MARGIN, 110, 600, 40, '下周学习建议', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    // 找出最弱领域
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
      `保持每周 ${data.streak > 0 ? `${data.streak} 天` : '至少 5 天'} 的学习频率，形成良好习惯。`,
    ];

    recommendations.forEach((rec, i) => {
      const y = 190 + i * 110;
      // 装饰竖线
      elements.push(shape(`rec-bar-${i}`, MARGIN, y, 4, 60, theme.accent, { radius: 2 }));
      elements.push(
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
      notes: '下周学习建议',
      elements,
    };
  }
}
