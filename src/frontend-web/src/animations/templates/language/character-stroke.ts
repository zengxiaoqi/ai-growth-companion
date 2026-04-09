/**
 * Chinese character stroke-by-stroke animation template.
 * Renders a tian-zi-ge grid with a progressive reveal effect simulating
 * left-to-right writing direction.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/sketch-registry';

// ── Template definition ──

const TEMPLATE_ID = 'language.character-stroke';

registerTemplate({
  id: TEMPLATE_ID,
  domain: 'language',
  subcategory: '汉字书写',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'character',
      type: 'string',
      required: true,
      defaultValue: '大',
      label: '要展示的汉字',
    },
    {
      name: 'strokeColor',
      type: 'color',
      required: false,
      defaultValue: '#2563EB',
      label: '笔画颜色',
    },
    {
      name: 'showGrid',
      type: 'boolean',
      required: false,
      defaultValue: true,
      label: '显示田字格',
    },
  ],
  defaultDurationSec: 8,
  description: '田字格中逐笔展示汉字书写过程，模拟从左到右的书写动画效果',
});

// ── p5 sketch ──

interface StrokeParams {
  character: string;
  strokeColor: string;
  showGrid: boolean;
}

function drawTianZiGe(p: p5, x: number, y: number, size: number): void {
  p.push();
  p.stroke('#D1D5DB');
  p.strokeWeight(1.5);
  p.noFill();

  // Outer border
  p.rect(x, y, size, size);

  // Center cross (dashed approximation via short segments)
  const midX = x + size / 2;
  const midY = y + size / 2;

  p.strokeWeight(1);
  p.stroke('#E5E7EB');

  // Horizontal center line
  const dashLen = 6;
  const gapLen = 4;
  for (let dx = x + dashLen; dx < x + size - dashLen; dx += dashLen + gapLen) {
    const endX = Math.min(dx + dashLen, x + size - dashLen);
    p.line(dx, midY, endX, midY);
  }

  // Vertical center line
  for (let dy = y + dashLen; dy < y + size - dashLen; dy += dashLen + gapLen) {
    const endY = Math.min(dy + dashLen, y + size - dashLen);
    p.line(midX, dy, midX, endY);
  }

  // Diagonal guides (corner to corner, lighter)
  p.stroke('#F3F4F6');
  p.strokeWeight(0.8);
  p.line(x, y, x + size, y + size);
  p.line(x + size, y, x, y + size);

  p.pop();
}

registerP5Sketch(TEMPLATE_ID, (p: p5, rawParams: Record<string, unknown>) => {
  const params: StrokeParams = {
    character: (rawParams.character as string) || '大',
    strokeColor: (rawParams.strokeColor as string) || '#2563EB',
    showGrid: rawParams.showGrid !== false,
  };

  const REVEAL_DURATION_MS = 4000;
  const PAUSE_AFTER_MS = 2000;
  let startTime = 0;
  let phase: 'writing' | 'pause' | 'done' = 'writing';
  let canvasSize = 400;

  // Offscreen buffer for the character
  let charBuffer: p5.Graphics | null = null;

  p.setup = () => {
    canvasSize = Math.min(p.windowWidth, 480);
    p.createCanvas(canvasSize, canvasSize);
    p.pixelDensity(2);
    p.textAlign(p.CENTER, p.CENTER);

    // Pre-render character into an offscreen buffer
    charBuffer = p.createGraphics(canvasSize, canvasSize);
    charBuffer.pixelDensity(2);
    charBuffer.background(255, 255, 255, 0);
    charBuffer.fill(params.strokeColor);
    charBuffer.noStroke();
    charBuffer.textAlign(p.CENTER, p.CENTER);
    charBuffer.textSize(canvasSize * 0.6);
    charBuffer.text(params.character, canvasSize / 2, canvasSize / 2);

    startTime = p.millis();
  };

  p.remove = () => {
    if (charBuffer) charBuffer.remove();
  };

  p.draw = () => {
    const elapsed = p.millis() - startTime;

    p.background('#FAFAFA');

    // Draw tian-zi-ge grid
    if (params.showGrid) {
      const padding = 24;
      drawTianZiGe(p, padding, padding, canvasSize - padding * 2);
    }

    // Calculate reveal progress
    let revealProgress: number;
    if (elapsed < REVEAL_DURATION_MS) {
      phase = 'writing';
      // Ease-out cubic for natural deceleration
      const t = elapsed / REVEAL_DURATION_MS;
      revealProgress = 1 - Math.pow(1 - t, 3);
    } else if (elapsed < REVEAL_DURATION_MS + PAUSE_AFTER_MS) {
      phase = 'pause';
      revealProgress = 1;
    } else {
      phase = 'done';
      revealProgress = 1;
    }

    // Progressive reveal: clip from left to right
    const gridPadding = 24;
    const gridX = gridPadding;
    const gridW = canvasSize - gridPadding * 2;
    const clipW = gridW * revealProgress;

    if (charBuffer) {
      // Draw the full character, then overlay a mask
      // First: draw character
      p.image(charBuffer, 0, 0, canvasSize, canvasSize);

      // Then: draw a white rectangle over the unrevealed portion
      if (revealProgress < 1) {
        const maskX = gridX + clipW;
        const maskW = gridX + gridW - maskX;
        if (maskW > 0) {
          p.noStroke();
          p.fill('#FAFAFA');
          p.rect(maskX, 0, maskW, canvasSize);
        }

        // Draw a soft edge at the writing tip
        const edgeX = gridX + clipW;
        for (let i = 0; i < 20; i++) {
          const alpha = p.map(i, 0, 20, 0, 80);
          p.fill(250, 250, 250, alpha);
          p.noStroke();
          p.rect(edgeX - i, 0, 1, canvasSize);
        }
      }
    }

    // Animate a writing cursor at the reveal edge
    if (phase === 'writing') {
      const cursorX = gridPadding + clipW;
      const cursorY = canvasSize / 2;
      // Pulsing dot cursor
      const pulse = Math.sin(p.millis() * 0.01) * 2 + 6;
      p.fill(params.strokeColor);
      p.noStroke();
      p.ellipse(cursorX, cursorY, pulse, pulse);
    }
  };
});
