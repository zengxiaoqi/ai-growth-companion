import { BentoSlideTemplate, PoetryData } from '../interfaces/bento-template.interface';
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

export class PoetryTemplate implements BentoSlideTemplate<PoetryData> {
  toSlides(data: PoetryData, theme: Theme): Slide[] {
    return [
      this.slideTitle(data, theme),
      this.slideOriginal(data, theme),
      this.slideTranslation(data, theme),
      ...(data.background ? [this.slideBackground(data, theme)] : []),
      this.slideNotes(data, theme),
      this.slideAppreciation(data, theme),
    ];
  }

  defaultTheme(): Theme {
    return {
      background: '#FFF8E7', // 米黄纸色
      color: '#3D2B1F',
      accent: '#C0392B', // 朱红
      fontFamily: FONT_STACK,
    };
  }

  private slideTitle(data: PoetryData, _theme: Theme): Slide {
    return {
      id: 'title',
      background: `linear-gradient(135deg, #2C1810 0%, #5D4037 50%, #3E2723 100%)`,
      transition: 'none',
      notes: `${data.title} — ${data.author}`,
      elements: [
        // 装饰 — 水墨风格圆
        shape('deco-1', 100, 60, 160, 160, 'rgba(255,255,255,0.05)', { shape: 'ellipse' }),
        shape('deco-2', 900, 400, 200, 200, 'rgba(255,255,255,0.04)', { shape: 'ellipse' }),
        text('poem-title', MARGIN, 200, CONTENT_W, 100, generateHtml(data.title), {
          fontSize: 60,
          fontWeight: 700,
          align: 'center',
          color: '#F5E6D3',
          lineHeight: 1.3,
        }),
        text('poem-author', MARGIN, 320, CONTENT_W, 50, `${data.dynasty} · ${data.author}`, {
          fontSize: 28,
          fontWeight: 500,
          align: 'center',
          color: 'rgba(245,230,211,0.7)',
        }),
        ...(data.type
          ? [
              text('poem-type', MARGIN, 380, CONTENT_W, 40, `【${data.type}】`, {
                fontSize: 22,
                fontWeight: 400,
                align: 'center',
                color: 'rgba(245,230,211,0.5)',
              }),
            ]
          : []),
        // 装饰线
        shape('title-line', 440, 480, 400, 2, 'rgba(245,230,211,0.3)', { radius: 1 }),
      ],
    };
  }

  private slideOriginal(data: PoetryData, theme: Theme): Slide {
    const linesHtml = data.lines
      .map((l) => l.trim())
      .filter(Boolean)
      .join('<br>');

    return {
      id: 'original',
      background: theme.background,
      transition: 'morph',
      notes: `${data.title} 原文`,
      elements: [
        // 顶部装饰框
        shape('orig-bar', MARGIN, 50, CONTENT_W, 4, theme.accent, { radius: 2 }),
        text('orig-title', MARGIN, 70, 400, 50, '📜 原文', {
          fontSize: 28,
          fontWeight: 700,
          color: theme.color,
        }),
        // 诗句居中
        text('orig-content', MARGIN, 160, CONTENT_W, 450, linesHtml, {
          fontSize: 36,
          fontWeight: 500,
          align: 'center',
          valign: 'middle',
          color: theme.color,
          lineHeight: 2.0,
          fontFamily: 'STKaiti, KaiTi, serif, ' + FONT_STACK,
        }),
      ],
    };
  }

  private slideTranslation(data: PoetryData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      shape('trans-bar', MARGIN, 50, CONTENT_W, 4, theme.accent, { radius: 2 }),
      text('trans-title', MARGIN, 70, 400, 50, '💬 白话翻译', {
        fontSize: 28,
        fontWeight: 700,
        color: theme.color,
      }),
    ];

    if (data.translation) {
      // 分段展示原文 + 翻译对照
      const lines = data.lines.map((l) => l.trim()).filter(Boolean);
      const translatedLines = data.translation.split(/[。；\n]/).filter(Boolean);
      let y = 150;
      for (let i = 0; i < Math.min(lines.length, translatedLines.length); i++) {
        if (y > 600) break;
        elements.push(
          text(`trans-orig-${i}`, MARGIN, y, CONTENT_W, 30, lines[i], {
            fontSize: 22,
            fontWeight: 500,
            color: theme.color,
            lineHeight: 1.5,
            fontFamily: 'STKaiti, KaiTi, serif, ' + FONT_STACK,
          }),
          text(`trans-text-${i}`, MARGIN, y + 32, CONTENT_W, 30, translatedLines[i], {
            fontSize: 20,
            fontWeight: 400,
            color: '#7F8C8D',
            lineHeight: 1.5,
          }),
        );
        y += 80;
      }
    } else {
      elements.push(
        text('trans-none', MARGIN, 200, 600, 50, '暂无白话翻译', {
          fontSize: 24,
          fontWeight: 500,
          color: '#95A5A6',
        }),
      );
    }

    return {
      id: 'translation',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '白话翻译',
    };
  }

  private slideBackground(data: PoetryData, theme: Theme): Slide {
    return {
      id: 'background',
      background: theme.background,
      transition: 'morph',
      notes: '创作背景',
      elements: [
        shape('bg-bar', MARGIN, 50, CONTENT_W, 4, '#8E44AD', { radius: 2 }),
        text('bg-title', MARGIN, 70, 400, 50, '📖 创作背景', {
          fontSize: 28,
          fontWeight: 700,
          color: theme.color,
        }),
        text('bg-content', MARGIN, 140, CONTENT_W, 480, data.background!, {
          fontSize: 24,
          fontWeight: 400,
          color: theme.color,
          lineHeight: 1.8,
        }),
      ],
    };
  }

  private slideNotes(data: PoetryData, theme: Theme): Slide {
    const elements: SlideElement[] = [
      shape('notes-bar', MARGIN, 50, CONTENT_W, 4, '#27AE60', { radius: 2 }),
      text('notes-title', MARGIN, 70, 400, 50, '📝 词句注释', {
        fontSize: 28,
        fontWeight: 700,
        color: theme.color,
      }),
    ];

    if (data.notes.length > 0) {
      let y = 140;
      data.notes.forEach((note, i) => {
        if (y > 600) return;
        elements.push(
          text(`notes-term-${i}`, MARGIN, y, 200, 30, note.term, {
            fontSize: 22,
            fontWeight: 700,
            color: theme.accent,
          }),
          text(`notes-explain-${i}`, MARGIN + 200, y, CONTENT_W - 200, 30, note.explanation, {
            fontSize: 20,
            fontWeight: 400,
            color: theme.color,
            lineHeight: 1.5,
          }),
        );
        y += 50;
      });
    } else {
      elements.push(
        text('notes-none', MARGIN, 200, 600, 50, '暂无词句注释', {
          fontSize: 24,
          fontWeight: 500,
          color: '#95A5A6',
        }),
      );
    }

    return {
      id: 'notes',
      background: theme.background,
      transition: 'morph',
      elements,
      notes: '词句注释',
    };
  }

  private slideAppreciation(data: PoetryData, theme: Theme): Slide {
    return {
      id: 'appreciation',
      background: theme.background,
      transition: 'morph',
      notes: '赏析',
      elements: [
        shape('app-bar', MARGIN, 50, CONTENT_W, 4, theme.accent, { radius: 2 }),
        text('app-title', MARGIN, 70, 400, 50, '🎨 赏析', {
          fontSize: 28,
          fontWeight: 700,
          color: theme.color,
        }),
        text('app-content', MARGIN, 140, CONTENT_W, 480, data.appreciation, {
          fontSize: 24,
          fontWeight: 400,
          color: theme.color,
          lineHeight: 1.8,
        }),
      ],
    };
  }
}

/** 将纯文本标题中的书名号等转换为 HTML */
function generateHtml(text: string): string {
  return text.replace(/《/g, '《').replace(/》/g, '》');
}
