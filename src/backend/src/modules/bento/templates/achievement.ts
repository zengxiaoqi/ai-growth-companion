import { BentoSlideTemplate, AchievementData } from '../interfaces/bento-template.interface';
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

const CATEGORY_EMOJI: Record<string, string> = {
  learning: '📚',
  social: '👥',
  creative: '🎨',
  physical: '🏃',
  reading: '📖',
  math: '🔢',
  science: '🔬',
  language: '🗣️',
  music: '🎵',
};

const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  diamond: '#B9F2FF',
};

export class AchievementTemplate implements BentoSlideTemplate<AchievementData> {
  toSlides(data: AchievementData, theme: Theme): Slide[] {
    return [
      this.slideCover(data, theme),
      ...this.slidesAchievements(data, theme),
      this.slideStats(data, theme),
    ];
  }

  defaultTheme(): Theme {
    return {
      background: '#0D1117', // 深色背景（成就的质感）
      color: '#E6EDF3',
      accent: '#FFD700', // 金色
      fontFamily: FONT_STACK,
    };
  }

  private slideCover(data: AchievementData, _theme: Theme): Slide {
    const totalUnlocked = data.achievements.filter((a) => a.unlocked).length;
    const total = data.achievements.length;
    const progress = total > 0 ? (totalUnlocked / total) * 100 : 0;

    return {
      id: 'achievement-cover',
      background: 'linear-gradient(135deg, #0D1117 0%, #1A1D23 50%, #0D1117 100%)',
      transition: 'none',
      notes: `${data.childName} 的成就展`,
      elements: [
        shape('cover-deco-1', 60, 30, 200, 200, 'rgba(255,215,0,0.05)', { shape: 'ellipse' }),
        shape('cover-deco-2', 900, 400, 300, 300, 'rgba(255,215,0,0.03)', { shape: 'ellipse' }),
        text('cover-title', MARGIN, 180, CONTENT_W, 80, '🏆 成就展', {
          fontSize: 56,
          fontWeight: 700,
          align: 'center',
          color: '#FFD700',
        }),
        text('cover-name', MARGIN, 280, CONTENT_W, 50, data.childName, {
          fontSize: 32,
          fontWeight: 500,
          align: 'center',
          color: '#E6EDF3',
        }),
        text('cover-count', MARGIN, 350, CONTENT_W, 40, `已解锁 ${totalUnlocked}/${total} 个成就`, {
          fontSize: 24,
          fontWeight: 400,
          align: 'center',
          color: '#8B949E',
        }),
        // 进度条
        shape('cover-progress-bg', 340, 410, 600, 8, 'rgba(255,255,255,0.1)', { radius: 4 }),
        ...(progress > 0
          ? [
              shape('cover-progress-fill', 340, 410, 600 * (progress / 100), 8, '#FFD700', {
                radius: 4,
              }),
            ]
          : []),
      ],
    };
  }

  private slidesAchievements(data: AchievementData, theme: Theme): Slide[] {
    // 每页最多 4 个成就
    const pageSize = 4;
    const pages: Slide[] = [];

    for (let page = 0; page < Math.ceil(data.achievements.length / pageSize); page++) {
      const pageAchievements = data.achievements.slice(page * pageSize, (page + 1) * pageSize);
      const elements: SlideElement[] = [
        text(`ach-page-title-${page}`, MARGIN, 50, 400, 50, `📋 成就列表（${page + 1}）`, {
          fontSize: 28,
          fontWeight: 700,
          color: '#E6EDF3',
        }),
      ];

      pageAchievements.forEach((ach, i) => {
        const isUnlocked = ach.unlocked;
        const color = isUnlocked ? TIER_COLORS[ach.tier] || '#FFD700' : '#484F58';
        const emoji = CATEGORY_EMOJI[ach.category] || '⭐';
        const y = 130 + i * 130;

        // 卡片背景
        elements.push(
          shape(
            `ach-card-${page}-${i}`,
            MARGIN - 5,
            y - 5,
            620,
            110,
            isUnlocked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
            {
              radius: 16,
              stroke: isUnlocked ? color : 'rgba(72,79,88,0.3)',
              strokeWidth: 1,
              shadow: isUnlocked ? { x: 0, y: 2, blur: 12, color: `${color}33` } : undefined,
            },
          ),
          // 左侧金色竖条
          ...(isUnlocked
            ? [shape(`ach-bar-${page}-${i}`, MARGIN - 5, y - 5, 4, 110, color, { radius: 2 })]
            : []),
          // 图标
          text(`ach-emoji-${page}-${i}`, MARGIN + 20, y + 10, 60, 60, emoji, {
            fontSize: 36,
            align: 'center',
            color: isUnlocked ? '#FFD700' : '#484F58',
          }),
          // 成就名称
          text(`ach-name-${page}-${i}`, MARGIN + 90, y + 10, 480, 35, ach.name, {
            fontSize: 24,
            fontWeight: 700,
            color: isUnlocked ? '#E6EDF3' : '#484F58',
          }),
          // 成就描述
          text(`ach-desc-${page}-${i}`, MARGIN + 90, y + 48, 480, 30, ach.description, {
            fontSize: 18,
            fontWeight: 400,
            color: isUnlocked ? '#8B949E' : '#484F58',
          }),
          // 解锁时间
          ...(isUnlocked && ach.unlockedAt
            ? [
                text(
                  `ach-date-${page}-${i}`,
                  MARGIN + 90,
                  y + 78,
                  480,
                  25,
                  `解锁于 ${new Date(ach.unlockedAt).toLocaleDateString('zh-CN')}`,
                  {
                    fontSize: 14,
                    fontWeight: 400,
                    color: '#6E7681',
                  },
                ),
              ]
            : []),
          // 未解锁的锁图标
          ...(!isUnlocked
            ? [
                text(`ach-lock-${page}-${i}`, MARGIN + 20, y + 10, 60, 60, '🔒', {
                  fontSize: 28,
                  align: 'center',
                  color: '#484F58',
                }),
              ]
            : []),
        );
      });

      pages.push({
        id: `achievements-page-${page}`,
        background: theme.background,
        transition: 'morph',
        elements,
        notes: `成就列表（${page + 1}）`,
      });
    }

    return pages;
  }

  private slideStats(data: AchievementData, theme: Theme): Slide {
    const totalUnlocked = data.achievements.filter((a) => a.unlocked).length;
    const total = data.achievements.length;
    const unlockedByTier = ['bronze', 'silver', 'gold', 'platinum', 'diamond']
      .map((tier) => ({
        tier,
        label:
          { bronze: '青铜', silver: '白银', gold: '黄金', platinum: '铂金', diamond: '钻石' }[
            tier
          ] || tier,
        count: data.achievements.filter((a) => a.tier === tier && a.unlocked).length,
        total: data.achievements.filter((a) => a.tier === tier).length,
        color: TIER_COLORS[tier] || '#FFFFFF',
      }))
      .filter((t) => t.total > 0);

    const elements: SlideElement[] = [
      text('stats-title', MARGIN, 50, 400, 50, '📊 成就统计', {
        fontSize: 28,
        fontWeight: 700,
        color: '#E6EDF3',
      }),
      text('stats-sub', MARGIN, 100, 600, 40, `总共 ${totalUnlocked}/${total} 个成就已解锁`, {
        fontSize: 22,
        fontWeight: 400,
        color: '#8B949E',
      }),
    ];

    // 总进度条
    const progress = total > 0 ? totalUnlocked / total : 0;
    elements.push(
      shape('stats-progress-bg', MARGIN, 160, CONTENT_W, 20, 'rgba(255,255,255,0.08)', {
        radius: 10,
      }),
      ...(progress > 0
        ? [
            shape('stats-progress-fill', MARGIN, 160, CONTENT_W * progress, 20, '#FFD700', {
              radius: 10,
            }),
          ]
        : []),
      text(
        'stats-progress-text',
        MARGIN + CONTENT_W + 10,
        155,
        100,
        30,
        `${Math.round(progress * 100)}%`,
        {
          fontSize: 22,
          fontWeight: 700,
          color: '#FFD700',
        },
      ),
    );

    // 各等级统计
    let y = 220;
    for (const tier of unlockedByTier) {
      const tierProgress = tier.total > 0 ? tier.count / tier.total : 0;
      elements.push(
        text(`tier-label-${tier.tier}`, MARGIN, y, 100, 30, tier.label, {
          fontSize: 20,
          fontWeight: 600,
          color: tier.color,
        }),
        shape(`tier-bg-${tier.tier}`, MARGIN + 110, y + 4, 400, 22, 'rgba(255,255,255,0.06)', {
          radius: 11,
        }),
        ...(tierProgress > 0
          ? [
              shape(
                `tier-fill-${tier.tier}`,
                MARGIN + 110,
                y + 4,
                400 * tierProgress,
                22,
                tier.color,
                { radius: 11 },
              ),
            ]
          : []),
        text(`tier-count-${tier.tier}`, MARGIN + 530, y, 100, 30, `${tier.count}/${tier.total}`, {
          fontSize: 20,
          fontWeight: 700,
          color: '#E6EDF3',
        }),
      );
      y += 50;
    }

    return {
      id: 'achievement-stats',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '成就统计',
    };
  }
}
