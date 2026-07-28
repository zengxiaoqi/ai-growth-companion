import { v4 as uuidv4 } from 'uuid';
import { BentoSlideTemplate, ReportData } from '../interfaces/bento-template.interface';
import { Slide, Theme, TextElement, TableElement } from '../interfaces/bento-document.interface';

const CANVAS_W = 1280;
const _CANVAS_H = 720;

function id(): string {
  return uuidv4().slice(0, 8);
}

function text(
  x: number,
  y: number,
  w: number,
  h: number,
  content: string,
  overrides?: Partial<TextElement>,
): TextElement {
  return {
    id: id(),
    type: 'text',
    x,
    y,
    w,
    h,
    text: content,
    fontSize: 28,
    fontWeight: 400,
    textAlign: 'left',
    color: '#333333',
    fontFamily: 'sans-serif',
    lineHeight: 1.4,
    ...overrides,
  };
}

function table(
  x: number,
  y: number,
  w: number,
  h: number,
  columns: { key: string; label: string; width?: number }[],
  rows: Record<string, string | number>[],
  overrides?: Partial<TableElement>,
): TableElement {
  return {
    id: id(),
    type: 'table',
    x,
    y,
    w,
    h,
    columns,
    rows,
    ...overrides,
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
      fontFamily: 'sans-serif',
    };
  }

  private slideCover(data: ReportData, theme: Theme): Slide {
    return {
      id: 'cover',
      background: `linear-gradient(135deg, ${theme.accent} 0%, #1a5276 100%)`,
      elements: [
        text(0, 260, CANVAS_W, 80, `${data.childName} 的学习报告`, {
          fontSize: 56,
          fontWeight: 700,
          textAlign: 'center',
          color: '#FFFFFF',
        }),
        text(0, 360, CANVAS_W, 50, `报告周期: ${data.period}`, {
          fontSize: 28,
          fontWeight: 400,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.85)',
        }),
        text(0, 440, CANVAS_W, 60, data.encouragement, {
          fontSize: 32,
          fontWeight: 500,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.9)',
        }),
      ],
    };
  }

  private slideOverview(data: ReportData, theme: Theme): Slide {
    const stats = [
      { label: '学习时长', value: formatDuration(data.totalLearningTime) },
      { label: '完成课程', value: `${data.totalLessonsCompleted} 课` },
      { label: '平均分', value: `${data.averageScore} 分` },
      { label: '连续学习', value: `${data.streak} 天` },
    ];

    const elements: (TextElement | TableElement)[] = [
      text(50, 50, 400, 60, '📊 本周概览', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
    ];

    stats.forEach((stat, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 80 + col * 340;
      const y = 160 + row * 200;
      elements.push(
        text(x, y, 280, 40, stat.label, {
          fontSize: 20,
          fontWeight: 500,
          color: '#7F8C8D',
        }),
        text(x, y + 45, 280, 60, stat.value, {
          fontSize: 42,
          fontWeight: 700,
          color: theme.accent,
        }),
      );
    });

    return { id: 'overview', elements };
  }

  private slideRadar(data: ReportData, theme: Theme): Slide {
    const elements: TextElement[] = [
      text(50, 50, 400, 60, '🎯 能力雷达', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text(50, 120, 600, 40, '各维度能力评估', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    DOMAIN_ORDER.forEach((domain, i) => {
      const score = data.skillProgress[domain] || 0;
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = 100 + col * 380;
      const cy = 240 + row * 200;

      // Radar bar background
      elements.push(
        text(cx, cy, 300, 35, DOMAIN_LABELS[domain] || domain, {
          fontSize: 22,
          fontWeight: 600,
          color: theme.color,
        }),
      );
      // Score bar background
      elements.push(
        text(cx, cy + 40, 300, 30, '', {
          fontSize: 0,
          style: {
            background: '#ECF0F1',
            borderRadius: 6,
            width: 300,
            height: 26,
          } as never,
        }),
      );
      // Score bar fill
      elements.push(
        text(cx, cy + 40, 300 * (score / 100), 30, '', {
          fontSize: 0,
          style: {
            background: `linear-gradient(90deg, ${theme.accent}, #85C1E9)`,
            borderRadius: 6,
            width: 300 * (score / 100),
            height: 26,
          } as never,
        }),
      );
      // Score label
      elements.push(
        text(cx + 310, cy + 40, 60, 30, `${score}`, {
          fontSize: 22,
          fontWeight: 700,
          color: theme.accent,
          textAlign: 'right',
        }),
      );
    });

    return { id: 'radar', elements };
  }

  private slideTrends(data: ReportData, theme: Theme): Slide {
    const columns = [
      { key: 'domain', label: '领域', width: 200 },
      { key: 'score', label: '分数', width: 120 },
    ];

    const rows = DOMAIN_ORDER.map((d) => ({
      domain: DOMAIN_LABELS[d] || d,
      score: data.skillProgress[d] || 0,
    }));

    const elements: (TextElement | TableElement)[] = [
      text(50, 50, 400, 60, '📈 各科趋势', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text(50, 120, 600, 40, '本周各领域能力分数', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
      table(50, 180, 600, 350, columns, rows, {
        headerStyle: { background: theme.accent, color: '#FFFFFF', fontWeight: 700 },
        cellStyle: { border: '1px solid #E0E0E0', padding: 8 },
      }),
    ];

    return { id: 'trends', elements };
  }

  private slideContentReview(data: ReportData, theme: Theme): Slide {
    const columns = [
      { key: 'date', label: '日期', width: 160 },
      { key: 'time', label: '学习时长', width: 160 },
      { key: 'completed', label: '完成课程', width: 140 },
      { key: 'score', label: '平均分', width: 120 },
    ];

    const rows = data.dailyStats.map((d) => ({
      date: d.date.slice(5),
      time: formatDuration(d.totalTime),
      completed: String(d.completedLessons),
      score: `${d.averageScore} 分`,
    }));

    const elements: (TextElement | TableElement)[] = [
      text(50, 50, 400, 60, '📚 学习内容回顾', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text(50, 120, 600, 40, '每日学习情况一览', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
      table(50, 180, 580, Math.min(400, rows.length * 50 + 40), columns, rows, {
        headerStyle: { background: theme.accent, color: '#FFFFFF', fontWeight: 700 },
        cellStyle: { border: '1px solid #E0E0E0', padding: 8 },
      }),
    ];

    return { id: 'content-review', elements };
  }

  private slideAchievements(data: ReportData, theme: Theme): Slide {
    const elements: TextElement[] = [
      text(50, 50, 400, 60, '🏆 成就墙', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text(50, 120, 600, 40, `本周共获得 ${data.achievements.length} 个成就`, {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    if (data.achievements.length === 0) {
      elements.push(
        text(80, 200, 500, 50, '本周还没有获得新成就，继续加油哦！', {
          fontSize: 24,
          fontWeight: 500,
          color: '#95A5A6',
        }),
      );
    } else {
      data.achievements.forEach((ach, i) => {
        const y = 190 + i * 90;
        elements.push(
          text(80, y, 50, 50, '⭐', {
            fontSize: 32,
            fontWeight: 400,
            color: '#F1C40F',
          }),
          text(150, y, 500, 35, ach.name, {
            fontSize: 24,
            fontWeight: 600,
            color: theme.color,
          }),
          text(150, y + 35, 500, 30, ach.description, {
            fontSize: 18,
            fontWeight: 400,
            color: '#7F8C8D',
          }),
        );
      });
    }

    return { id: 'achievements', elements };
  }

  private slideInsights(data: ReportData, theme: Theme): Slide {
    const elements: TextElement[] = [
      text(50, 50, 400, 60, '🤖 AI 洞察', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text(50, 120, 600, 40, '基于学习数据的个性化分析', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    if (data.insights.length === 0) {
      elements.push(
        text(80, 200, 700, 50, '暂无洞察数据，持续学习后将生成个性化建议。', {
          fontSize: 24,
          fontWeight: 500,
          color: '#95A5A6',
        }),
      );
    } else {
      data.insights.forEach((insight, i) => {
        const y = 190 + i * 100;
        elements.push(
          text(80, y, 50, 40, `${i + 1}.`, {
            fontSize: 28,
            fontWeight: 700,
            color: theme.accent,
          }),
          text(130, y, 700, 80, insight, {
            fontSize: 24,
            fontWeight: 400,
            color: theme.color,
            lineHeight: 1.5,
          }),
        );
      });
    }

    return { id: 'insights', elements };
  }

  private slideRecommendations(data: ReportData, theme: Theme): Slide {
    const elements: TextElement[] = [
      text(50, 50, 400, 60, '🚀 推荐内容', {
        fontSize: 36,
        fontWeight: 700,
        color: theme.color,
      }),
      text(50, 120, 600, 40, '下周学习建议', {
        fontSize: 22,
        fontWeight: 400,
        color: '#7F8C8D',
      }),
    ];

    // Find weakest domain
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
      `尝试不同类型的知识点，拓展学习广度。`,
      `保持每周 ${data.streak > 0 ? `${data.streak} 天` : '至少 5 天'} 的学习频率，形成良好习惯。`,
    ];

    recommendations.forEach((rec, i) => {
      const y = 190 + i * 110;
      elements.push(
        text(80, y, 50, 40, '💡', {
          fontSize: 28,
          fontWeight: 400,
          color: theme.accent,
        }),
        text(140, y, 700, 80, rec, {
          fontSize: 22,
          fontWeight: 400,
          color: theme.color,
          lineHeight: 1.5,
        }),
      );
    });

    return { id: 'recommendations', elements };
  }
}
