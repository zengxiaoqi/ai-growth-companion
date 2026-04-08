/**
 * Abacus bead animation template.
 * An abacus frame with horizontal rods where beads slide from left
 * to right with bounce, and number labels appear below each row.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/AnimationRenderer';

// ── Template registration ──

registerTemplate({
  id: 'math.abacus',
  domain: 'math',
  subcategory: 'abacus',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  defaultDurationSec: 8,
  description: '算盘珠子从左滑向右边，学习计数和数量概念',
  params: [
    {
      name: 'rows',
      type: 'number',
      required: false,
      defaultValue: 3,
      label: '行数',
    },
    {
      name: 'values',
      type: 'number[]',
      required: false,
      defaultValue: [3, 5, 2],
      label: '每行目标数',
    },
    {
      name: 'showNumbers',
      type: 'boolean',
      required: false,
      defaultValue: true,
      label: '显示数字',
    },
  ],
});

// ── Sketch registration ──

registerP5Sketch('math.abacus', (p: p5, params: Record<string, unknown>) => {
  const rows = (params.rows as number) || 3;
  const values = (params.values as number[]) || [3, 5, 2];
  const showNumbers = (params.showNumbers as boolean) ?? true;

  const maxBeadsPerRow = 9; // visual maximum
  const beadSize = 22;
  const beadSpacing = beadSize * 1.4;

  interface BeadState {
    row: number;
    index: number;
    x: number;
    targetX: number;
    startY: number;
    y: number;
    color: string;
    appeared: boolean;
    appearTime: number;
    bouncePhase: number;
  }

  const beads: BeadState[] = [];
  let startTime = 0;
  const beadInterval = 200; // ms between beads within a row
  const rowInterval = 800; // ms between rows
  const slideDuration = 500; // ms for bead slide

  const rowColors = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

  /** Get the y position for a given row index */
  function rowY(rowIdx: number): number {
    const topPadding = p.height * 0.15;
    const availableHeight = p.height * 0.6;
    const gap = availableHeight / (rows + 1);
    return topPadding + gap * (rowIdx + 1);
  }

  /** Left edge of the abacus frame */
  function frameLeft(): number {
    return p.width * 0.12;
  }

  /** Right edge of the abacus frame */
  function frameRight(): number {
    return p.width * 0.88;
  }

  /** X position for bead at given index */
  function beadTargetX(_rowIdx: number, beadIdx: number): number {
    const left = frameLeft() + 20;
    const right = frameRight() - 20;
    const usableWidth = right - left;
    const maxBeadWidth = maxBeadsPerRow * beadSpacing;
    const startX = left + (usableWidth - maxBeadWidth) / 2;
    return startX + beadIdx * beadSpacing;
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    p.textAlign(p.CENTER, p.CENTER);
    startTime = p.millis();

    for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
      const count = Math.min(values[rowIdx] || 0, maxBeadsPerRow);
      const col = rowColors[rowIdx % rowColors.length];

      for (let beadIdx = 0; beadIdx < count; beadIdx++) {
        const targetX = beadTargetX(rowIdx, beadIdx);
        const y = rowY(rowIdx);

        beads.push({
          row: rowIdx,
          index: beadIdx,
          x: frameLeft() - 40, // start off-screen left
          targetX,
          startY: y,
          y,
          color: col,
          appeared: false,
          appearTime: startTime + rowIdx * rowInterval + beadIdx * beadInterval + 600,
          bouncePhase: 0,
        });
      }
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    for (const bead of beads) {
      bead.targetX = beadTargetX(bead.row, bead.index);
      bead.startY = rowY(bead.row);
      if (bead.appeared) {
        bead.x = bead.targetX;
        bead.y = bead.startY;
      }
    }
  };

  p.draw = () => {
    p.background(255, 253, 248);
    const now = p.millis();
    const fl = frameLeft();
    const fr = frameRight();

    // ── Title ──
    p.push();
    p.textSize(18);
    p.fill(80, 80, 100);
    p.textStyle(p.BOLD);
    p.text('\u7B97\u76D8\u6570\u4E00\u6570', p.width / 2, p.height * 0.06);
    p.pop();

    // ── Abacus frame ──
    p.push();
    const frameTop = rowY(0) - beadSize - 10;
    const frameBottom = rowY(rows - 1) + beadSize + 10;

    // Vertical side bars
    p.stroke(139, 115, 85);
    p.strokeWeight(8);
    p.line(fl, frameTop, fl, frameBottom);
    p.line(fr, frameTop, fr, frameBottom);

    // Top and bottom horizontal bars
    p.strokeWeight(6);
    p.line(fl - 4, frameTop, fr + 4, frameTop);
    p.line(fl - 4, frameBottom, fr + 4, frameBottom);

    // Rounded bar ends
    p.noStroke();
    p.fill(139, 115, 85);
    p.ellipse(fl, frameTop, 14, 14);
    p.ellipse(fr, frameTop, 14, 14);
    p.ellipse(fl, frameBottom, 14, 14);
    p.ellipse(fr, frameBottom, 14, 14);
    p.pop();

    // ── Rods (horizontal bars for beads) ──
    p.push();
    p.stroke(180, 170, 155);
    p.strokeWeight(3);
    for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
      const y = rowY(rowIdx);
      p.line(fl + 8, y, fr - 8, y);
    }
    p.pop();

    // ── Animate beads ──
    for (const bead of beads) {
      if (!bead.appeared && now >= bead.appearTime) {
        bead.appeared = true;
      }

      if (!bead.appeared) continue;

      const elapsed = now - bead.appearTime;
      const t = Math.min(1, elapsed / slideDuration);

      // Ease-out back (slight overshoot for bounce feel)
      const c1 = 1.3;
      const c3 = c1 + 1;
      const ease = t < 1
        ? 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
        : 1;

      bead.x = p.lerp(fl - 40, bead.targetX, Math.min(1, ease));
      bead.y = bead.startY;

      // Vertical bounce on landing
      if (t >= 1) {
        bead.x = bead.targetX;
        bead.bouncePhase += 0.15;
        const bounceDecay = Math.max(0, 1 - (elapsed - slideDuration) / 800);
        bead.y = bead.startY + Math.sin(bead.bouncePhase) * 4 * bounceDecay;
      }

      // Shadow
      p.push();
      p.noStroke();
      p.fill(0, 0, 0, 20);
      p.ellipse(bead.x + 2, bead.y + 2, beadSize, beadSize);
      p.pop();

      // Bead
      p.push();
      p.noStroke();
      const beadColor = p.color(bead.color);
      p.fill(beadColor);
      p.ellipse(bead.x, bead.y, beadSize, beadSize);

      // Highlight
      p.fill(255, 255, 255, 70);
      p.ellipse(bead.x - beadSize * 0.15, bead.y - beadSize * 0.15, beadSize * 0.35, beadSize * 0.28);
      p.pop();

      // Center dot
      p.push();
      p.noStroke();
      p.fill(255, 255, 255, 120);
      p.ellipse(bead.x, bead.y, 6, 6);
      p.pop();
    }

    // ── Number labels below each row ──
    if (showNumbers) {
      p.push();
      for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
        // Count appeared beads in this row
        let count = 0;
        for (const bead of beads) {
          if (bead.row === rowIdx && bead.appeared) count++;
        }

        const labelX = fr + 25;
        if (labelX < p.width - 10) {
          p.textSize(20);
          p.textStyle(p.BOLD);
          p.fill(p.color(rowColors[rowIdx % rowColors.length]));
          p.text(String(count), labelX, rowY(rowIdx));
        }

        // Row label (left side)
        const rowLabelX = fl - 25;
        if (rowLabelX > 10) {
          p.textSize(14);
          p.textStyle(p.NORMAL);
          p.fill(150, 150, 160);
          p.text(`\u7B2C${rowIdx + 1}\u884C`, rowLabelX, rowY(rowIdx));
        }
      }
      p.pop();
    }

    // ── Total display ──
    let totalAppeared = 0;
    let totalTarget = 0;
    for (const bead of beads) {
      totalTarget++;
      if (bead.appeared) totalAppeared++;
    }

    p.push();
    const totalY = rowY(rows - 1) + beadSize + 55;
    if (totalY < p.height - 20) {
      p.textSize(22);
      p.textStyle(p.BOLD);
      p.fill(60, 60, 80);
      p.text(`\u5408\u8BA1: ${totalAppeared}`, p.width / 2, totalY);
    }
    p.pop();
  };
});
