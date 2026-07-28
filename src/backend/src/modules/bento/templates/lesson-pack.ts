import { BentoSlideTemplate, ContentSlideData } from '../interfaces/bento-template.interface';
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

const DOMAIN_EMOJI: Record<string, string> = {
  language: '📖',
  math: '🔢',
  science: '🔬',
  art: '🎨',
  social: '👥',
};

export class LessonPackTemplate implements BentoSlideTemplate<ContentSlideData> {
  toSlides(data: ContentSlideData, theme: Theme): Slide[] {
    const slides: Slide[] = [this.slideCover(data, theme)];

    data.sections.forEach((section, i) => {
      slides.push(this.slideSection(section, i, data, theme));
    });

    if (data.summary) {
      slides.push(this.slideSummary(data, theme));
    }

    return slides;
  }

  defaultTheme(): Theme {
    return {
      background: '#FFFFFF',
      color: '#2C3E50',
      accent: '#2ECC71', // 绿色（儿童友好）
      fontFamily: FONT_STACK,
    };
  }

  private slideCover(data: ContentSlideData, theme: Theme): Slide {
    const emoji = DOMAIN_EMOJI[data.domain] || '📚';
    return {
      id: 'cover',
      background: `linear-gradient(135deg, ${theme.accent} 0%, #1A6B3C 100%)`,
      transition: 'none',
      notes: `${data.title} — ${data.ageRange}岁`,
      elements: [
        shape('cover-deco-1', 80, 40, 180, 180, 'rgba(255,255,255,0.08)', { shape: 'ellipse' }),
        shape('cover-deco-2', 950, 420, 250, 250, 'rgba(255,255,255,0.06)', { shape: 'ellipse' }),
        text('cover-emoji', MARGIN, 180, CONTENT_W, 80, emoji, {
          fontSize: 72,
          align: 'center',
          color: '#FFFFFF',
        }),
        text('cover-title', MARGIN, 280, CONTENT_W, 80, data.title, {
          fontSize: 52,
          fontWeight: 700,
          align: 'center',
          color: '#FFFFFF',
        }),
        ...(data.subtitle
          ? [
              text('cover-subtitle', MARGIN, 370, CONTENT_W, 50, data.subtitle, {
                fontSize: 28,
                fontWeight: 400,
                align: 'center',
                color: 'rgba(255,255,255,0.85)',
              }),
            ]
          : []),
        text('cover-age', MARGIN, 440, CONTENT_W, 40, `适合 ${data.ageRange} 岁儿童`, {
          fontSize: 22,
          fontWeight: 400,
          align: 'center',
          color: 'rgba(255,255,255,0.7)',
        }),
      ],
    };
  }

  private slideSection(
    section: ContentSlideData['sections'][0],
    index: number,
    data: ContentSlideData,
    theme: Theme,
  ): Slide {
    const id = `section-${index}`;
    const sectionEmoji =
      section.type === 'text'
        ? '📝'
        : section.type === 'image'
          ? '🖼️'
          : section.type === 'game'
            ? '🎮'
            : '❓';

    const elements: SlideElement[] = [
      shape(`${id}-bar`, MARGIN, 50, CONTENT_W, 4, theme.accent, { radius: 2 }),
      text(`${id}-title`, MARGIN, 70, CONTENT_W, 50, `${sectionEmoji} 第${index + 1}部分`, {
        fontSize: 24,
        fontWeight: 600,
        color: theme.accent,
      }),
    ];

    if (section.type === 'text') {
      elements.push(
        text(`${id}-content`, MARGIN, 140, CONTENT_W, 500, section.content, {
          fontSize: 26,
          fontWeight: 400,
          color: theme.color,
          lineHeight: 1.8,
        }),
      );
    } else if (section.type === 'image' && section.imageUrl) {
      elements.push(
        text(`${id}-content`, MARGIN, 140, CONTENT_W, 400, section.content, {
          fontSize: 24,
          fontWeight: 400,
          color: theme.color,
          lineHeight: 1.6,
        }),
        text(`${id}-img-placeholder`, MARGIN, 400, 400, 40, '🖼️ 图片位置', {
          fontSize: 20,
          fontWeight: 500,
          align: 'center',
          color: '#95A5A6',
        }),
      );
    } else {
      // game / quiz
      elements.push(
        shape(`${id}-card`, MARGIN, 140, CONTENT_W, 200, '#FFFFFF', {
          radius: 16,
          shadow: { x: 0, y: 2, blur: 12, color: 'rgba(0,0,0,0.08)' },
        }),
        text(`${id}-content`, MARGIN + 20, 160, CONTENT_W - 40, 160, section.content, {
          fontSize: 24,
          fontWeight: 400,
          color: theme.color,
          lineHeight: 1.6,
        }),
      );
    }

    return {
      id,
      background: theme.background,
      transition: 'morph',
      elements,
      notes: `第${index + 1}部分`,
    };
  }

  private slideSummary(data: ContentSlideData, theme: Theme): Slide {
    return {
      id: 'summary',
      background: `linear-gradient(135deg, ${theme.accent} 0%, #1A6B3C 100%)`,
      transition: 'morph',
      notes: '课程总结',
      elements: [
        text('summary-title', MARGIN, 120, CONTENT_W, 60, '🎉 课程总结', {
          fontSize: 40,
          fontWeight: 700,
          align: 'center',
          color: '#FFFFFF',
        }),
        text('summary-content', MARGIN, 220, CONTENT_W, 300, data.summary!, {
          fontSize: 28,
          fontWeight: 400,
          align: 'center',
          color: 'rgba(255,255,255,0.92)',
          lineHeight: 1.8,
        }),
      ],
    };
  }
}
