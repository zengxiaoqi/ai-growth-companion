/**
 * Drawing steps animation template.
 * Builds a simple line drawing stroke by stroke with pauses between steps.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/sketch-registry';

// ── Template registration ──

registerTemplate({
  id: 'art.drawing-steps',
  domain: 'art',
  subcategory: 'drawing',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'steps',
      type: 'string[]',
      required: false,
      defaultValue: ['circle', 'line', 'circle'],
      label: '绘画步骤',
    },
    {
      name: 'lineColor',
      type: 'color',
      required: false,
      defaultValue: '#1F2937',
      label: '线条颜色',
    },
  ],
  defaultDurationSec: 12,
  description: '分步绘画动画：一步一步展示简单的绘画过程',
});

// ── Sketch registration ──

registerP5Sketch('art.drawing-steps', (p: p5, params: Record<string, unknown>) => {
  const steps = (params.steps as string[]) || ['circle', 'line', 'circle'];
  const lineColorHex = (params.lineColor as string) || '#1F2937';

  let strokeColor: p5.Color;
  let currentStep = 0;
  let stepProgress = 0;
  let pauseTimer = 0;
  let isPaused = false;
  let allDone = false;

  // Canvas drawing area
  const drawArea = { x: 80, y: 60, w: 480, h: 280 };

  p.setup = () => {
    p.createCanvas(640, 400);
    p.textAlign(p.CENTER, p.CENTER);
    strokeColor = p.color(lineColorHex);
  };

  p.draw = () => {
    const dt = p.deltaTime / 1000;

    drawBackground();
    drawCanvasArea();
    drawTitle();
    drawStepIndicator();

    // Update step progress
    if (allDone) {
      drawAllSteps(1);
      drawCompleteStamp();
      return;
    }

    if (isPaused) {
      drawAllSteps(1);
      drawPauseIndicator();
      pauseTimer -= dt;
      if (pauseTimer <= 0) {
        isPaused = false;
        currentStep++;
        if (currentStep >= steps.length) {
          allDone = true;
        }
      }
      return;
    }

    // Advance drawing progress for current step
    stepProgress += dt * 0.8;
    if (stepProgress >= 1) {
      stepProgress = 1;
      isPaused = true;
      pauseTimer = 0.6;
    }

    // Draw completed steps + current step
    drawAllSteps(stepProgress);
  };

  function drawBackground() {
    p.background(245, 243, 240);
  }

  function drawCanvasArea() {
    // Paper-like canvas
    p.noStroke();
    p.fill(255, 255, 252);
    p.rect(drawArea.x, drawArea.y, drawArea.w, drawArea.h, 8);

    // Paper shadow
    p.fill(0, 0, 0, 8);
    p.rect(drawArea.x + 3, drawArea.y + 3, drawArea.w, drawArea.h, 8);

    // Re-draw paper on top
    p.fill(255, 255, 252);
    p.rect(drawArea.x, drawArea.y, drawArea.w, drawArea.h, 8);

    // Grid dots
    p.fill(220, 215, 210);
    for (let gx = drawArea.x + 20; gx < drawArea.x + drawArea.w; gx += 20) {
      for (let gy = drawArea.y + 20; gy < drawArea.y + drawArea.h; gy += 20) {
        p.ellipse(gx, gy, 1.5, 1.5);
      }
    }
  }

  function drawTitle() {
    p.fill(60, 60, 80);
    p.noStroke();
    p.textSize(16);
    p.textStyle(p.BOLD);
    p.text('分步绘画', p.width / 2, 30);
  }

  function drawStepIndicator() {
    const dotSize = 10;
    const spacing = 24;
    const startX = p.width / 2 - ((steps.length - 1) * spacing) / 2;
    const dotY = p.height - 25;

    for (let i = 0; i < steps.length; i++) {
      if (i < currentStep || (i === currentStep && !isPaused && !allDone)) {
        p.fill(strokeColor);
      } else if (i === currentStep) {
        p.fill(255, 180, 50);
      } else {
        p.fill(200, 200, 210);
      }
      p.noStroke();
      p.ellipse(startX + i * spacing, dotY, dotSize, dotSize);
    }

    // Step label
    if (!allDone && currentStep < steps.length) {
      p.fill(120, 120, 140);
      p.textSize(12);
      p.textStyle(p.NORMAL);
      p.text(
        `第 ${currentStep + 1} 步 / 共 ${steps.length} 步`,
        p.width / 2,
        p.height - 10,
      );
    }
  }

  function drawAllSteps(currentStepProgress: number) {
    p.push();
    p.clip(() => {
      p.rect(drawArea.x, drawArea.y, drawArea.w, drawArea.h);
    });

    const cx = drawArea.x + drawArea.w / 2;
    const cy = drawArea.y + drawArea.h / 2;

    for (let i = 0; i <= Math.min(currentStep, steps.length - 1); i++) {
      const shape = steps[i];
      const progress = i < currentStep ? 1 : currentStepProgress;

      p.stroke(strokeColor);
      p.strokeWeight(3);
      p.noFill();

      drawShape(shape, cx, cy, progress, i);
    }

    p.pop();
  }

  function drawShape(shape: string, cx: number, cy: number, progress: number, stepIdx: number) {
    // Offset each shape slightly so they don't all overlap at center
    const offsets = getShapeOffsets(steps.length, stepIdx);

    switch (shape) {
      case 'circle': {
        const r = 40;
        const endAngle = p.TWO_PI * progress;
        p.arc(cx + offsets.x, cy + offsets.y, r * 2, r * 2, 0, endAngle);
        break;
      }
      case 'line': {
        const len = 80 * progress;
        p.line(
          cx + offsets.x - 40,
          cy + offsets.y,
          cx + offsets.x - 40 + len,
          cy + offsets.y,
        );
        break;
      }
      case 'triangle': {
        const size = 40;
        const pts = [
          { x: cx + offsets.x, y: cy + offsets.y - size },
          { x: cx + offsets.x - size, y: cy + offsets.y + size * 0.6 },
          { x: cx + offsets.x + size, y: cy + offsets.y + size * 0.6 },
        ];
        drawPartialPolyline(pts, progress, true);
        break;
      }
      case 'rectangle': {
        const w = 60;
        const h = 40;
        const rx = cx + offsets.x - w / 2;
        const ry = cy + offsets.y - h / 2;
        const corners = [
          { x: rx, y: ry },
          { x: rx + w, y: ry },
          { x: rx + w, y: ry + h },
          { x: rx, y: ry + h },
        ];
        drawPartialPolyline(corners, progress, true);
        break;
      }
      case 'square': {
        const s = 50;
        const rx = cx + offsets.x - s / 2;
        const ry = cy + offsets.y - s / 2;
        const corners = [
          { x: rx, y: ry },
          { x: rx + s, y: ry },
          { x: rx + s, y: ry + s },
          { x: rx, y: ry + s },
        ];
        drawPartialPolyline(corners, progress, true);
        break;
      }
      case 'star': {
        const outerR = 40;
        const innerR = 18;
        const starPts: { x: number; y: number }[] = [];
        for (let i = 0; i < 10; i++) {
          const angle = (i * p.PI) / 5 - p.HALF_PI;
          const r = i % 2 === 0 ? outerR : innerR;
          starPts.push({
            x: cx + offsets.x + p.cos(angle) * r,
            y: cy + offsets.y + p.sin(angle) * r,
          });
        }
        drawPartialPolyline(starPts, progress, true);
        break;
      }
      default: {
        // Default to circle
        const r = 40;
        const endAngle = p.TWO_PI * progress;
        p.arc(cx + offsets.x, cy + offsets.y, r * 2, r * 2, 0, endAngle);
        break;
      }
    }
  }

  function getShapeOffsets(
    totalSteps: number,
    stepIdx: number,
  ): { x: number; y: number } {
    if (totalSteps === 1) return { x: 0, y: 0 };

    // Spread shapes out in a grid-like arrangement
    const cols = Math.min(totalSteps, 3);
    const row = Math.floor(stepIdx / cols);
    const col = stepIdx % cols;
    const spacingX = 120;
    const spacingY = 100;
    const offsetX = (cols - 1) * spacingX * -0.5;
    const rows = Math.ceil(totalSteps / cols);
    const offsetY = (rows - 1) * spacingY * -0.5;

    return {
      x: offsetX + col * spacingX,
      y: offsetY + row * spacingY,
    };
  }

  function drawPartialPolyline(
    pts: { x: number; y: number }[],
    progress: number,
    closed: boolean,
  ) {
    const totalPts = closed ? pts.length + 1 : pts.length;
    const segmentsToDraw = progress * totalPts;

    for (let i = 0; i < Math.floor(segmentsToDraw); i++) {
      const from = pts[i % pts.length];
      const to = pts[(i + 1) % pts.length];
      p.line(from.x, from.y, to.x, to.y);
    }

    // Partial segment
    const frac = segmentsToDraw % 1;
    if (frac > 0 && Math.floor(segmentsToDraw) < (closed ? pts.length : pts.length - 1)) {
      const idx = Math.floor(segmentsToDraw);
      const from = pts[idx % pts.length];
      const to = pts[(idx + 1) % pts.length];
      p.line(from.x, from.y, p.lerp(from.x, to.x, frac), p.lerp(from.y, to.y, frac));
    }
  }

  function drawPauseIndicator() {
    // Small animated pencil icon hint
    const pulseAlpha = 128 + p.sin(p.frameCount * 0.08) * 80;
    p.noStroke();
    p.fill(255, 180, 50, pulseAlpha);
    p.textSize(13);
    p.textStyle(p.BOLD);
    p.text('...', p.width / 2, drawArea.y + drawArea.h + 18);
  }

  function drawCompleteStamp() {
    const stampAlpha = Math.min(255, (p.frameCount % 1000) * 3);
    p.noStroke();
    p.fill(80, 180, 80, stampAlpha * 0.15);
    p.rectMode(p.CENTER);
    p.rect(p.width / 2, drawArea.y + drawArea.h + 15, 120, 24, 12);
    p.rectMode(p.CORNER);

    p.fill(80, 180, 80, stampAlpha);
    p.textSize(14);
    p.textStyle(p.BOLD);
    p.text('绘画完成!', p.width / 2, drawArea.y + drawArea.h + 15);
  }
});
