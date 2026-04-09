/**
 * Word-by-word reveal animation template.
 * Shows a list of words one at a time with bounce/scale animation per character,
 * highlighting the current word and dimming previous ones.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/sketch-registry';

// ── Template definition ──

const TEMPLATE_ID = 'language.word-reveal';

registerTemplate({
  id: TEMPLATE_ID,
  domain: 'language',
  subcategory: '词语展示',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'words',
      type: 'string[]',
      required: true,
      defaultValue: ['太阳', '月亮', '星星'],
      label: '要展示的词语列表',
    },
    {
      name: 'revealSpeed',
      type: 'number',
      required: false,
      defaultValue: 500,
      label: '每个字符的显示速度（毫秒）',
    },
    {
      name: 'highlightColor',
      type: 'color',
      required: false,
      defaultValue: '#F59E0B',
      label: '高亮颜色',
    },
  ],
  defaultDurationSec: 12,
  description: '逐个展示词语，每个字有弹跳缩放动画，当前词语高亮，已展示词语变暗',
});

// ── p5 sketch ──

interface WordRevealParams {
  words: string[];
  revealSpeed: number;
  highlightColor: string;
}

/** Easing: elastic out for bounce effect */
function elasticOut(t: number): number {
  if (t === 0 || t === 1) return t;
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
}

registerP5Sketch(TEMPLATE_ID, (p: p5, rawParams: Record<string, unknown>) => {
  const params: WordRevealParams = {
    words: (rawParams.words as string[]) || ['太阳', '月亮', '星星'],
    revealSpeed: (rawParams.revealSpeed as number) || 500,
    highlightColor: (rawParams.highlightColor as string) || '#F59E0B',
  };

  let startTime = 0;
  let canvasW = 480;
  let canvasH = 360;

  // Pre-compute timing: each character gets revealSpeed ms
  // Between words there is a short pause
  const INTER_WORD_PAUSE_MS = 600;
  const CHAR_ANIM_DURATION_MS = 400;

  function getCharTimeOffset(wordIndex: number, charIndex: number): number {
    let offset = 0;
    for (let w = 0; w < wordIndex; w++) {
      offset += params.words[w].length * params.revealSpeed + INTER_WORD_PAUSE_MS;
    }
    offset += charIndex * params.revealSpeed;
    return offset;
  }

  function getTotalDuration(): number {
    const lastWord = params.words.length - 1;
    const lastChar = params.words[lastWord].length - 1;
    return getCharTimeOffset(lastWord, lastChar) + params.revealSpeed + 2000;
  }

  p.setup = () => {
    canvasW = Math.min(p.windowWidth, 520);
    canvasH = 400;
    p.createCanvas(canvasW, canvasH);
    p.pixelDensity(2);
    p.textAlign(p.CENTER, p.CENTER);
    startTime = p.millis();
  };

  p.draw = () => {
    const elapsed = p.millis() - startTime;
    p.background('#FFFBEB');

    // Title area
    p.noStroke();
    p.fill('#92400E');
    p.textSize(16);
    p.textAlign(p.CENTER, p.TOP);
    p.text('看谁认得多', canvasW / 2, 16);

    // Layout: words arranged vertically, centered
    const startY = 60;
    const lineSpacing = 56;
    p.textAlign(p.CENTER, p.CENTER);

    for (let w = 0; w < params.words.length; w++) {
      const word = params.words[w];
      const wordY = startY + w * lineSpacing + lineSpacing / 2;
      let isWordActive = false;
      let isWordComplete = true;

      // Check word state
      for (let c = 0; c < word.length; c++) {
        const charStart = getCharTimeOffset(w, c);
        if (elapsed < charStart) {
          isWordComplete = false;
        }
        if (elapsed >= charStart && elapsed < charStart + params.revealSpeed + CHAR_ANIM_DURATION_MS) {
          isWordActive = true;
        }
      }

      // Draw each character
      let charX = canvasW / 2 - ((word.length - 1) * 48) / 2;

      for (let c = 0; c < word.length; c++) {
        const charStart = getCharTimeOffset(w, c);
        const charElapsed = elapsed - charStart;

        if (charElapsed < 0) {
          // Character not yet visible: draw placeholder
          p.fill('#E5E7EB');
          p.textSize(36);
          p.text('_', charX, wordY);
          isWordComplete = false;
        } else {
          // Character is visible
          const animProgress = Math.min(charElapsed / CHAR_ANIM_DURATION_MS, 1);
          const scale = elasticOut(animProgress);
          const alpha = p.constrain(p.map(animProgress, 0, 0.3, 0, 255), 0, 255);

          if (isWordActive) {
            // Current word: highlighted
            p.fill(params.highlightColor + hexAlpha(alpha));
          } else if (isWordComplete) {
            // Past word: dimmed
            p.fill('#9CA3AF');
          } else {
            p.fill(params.highlightColor + hexAlpha(alpha));
          }

          p.textSize(36 * scale);
          p.text(word[c], charX, wordY);
        }

        charX += 48;
      }

      // Word highlight underline for active word
      if (isWordActive && !isWordComplete) {
        const wordWidth = (word.length - 1) * 48;
        const underlineX = canvasW / 2 - wordWidth / 2;
        p.stroke(params.highlightColor);
        p.strokeWeight(2);
        p.line(underlineX - 8, wordY + 22, underlineX + wordWidth + 8, wordY + 22);
        p.noStroke();
      }
    }

    // Check if animation is done
    if (elapsed > getTotalDuration()) {
      // Show completion star burst
      const centerX = canvasW / 2;
      const centerY = canvasH - 40;
      p.fill(params.highlightColor);
      p.textSize(20);
      p.textAlign(p.CENTER, p.CENTER);
      p.text('全部完成！', centerX, centerY);
    }
  };
});

/** Convert alpha 0-255 to two-char hex string */
function hexAlpha(a: number): string {
  const clamped = Math.round(Math.max(0, Math.min(255, a)));
  const hex = clamped.toString(16).padStart(2, '0');
  return hex;
}
