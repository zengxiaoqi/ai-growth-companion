/**
 * Number line with hopping animation template.
 * A character hops along a number line with squash-stretch,
 * and sparkle effects trigger on the highlighted number.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/sketch-registry';

// ── Template registration ──

registerTemplate({
  id: 'math.number-line',
  domain: 'math',
  subcategory: 'number-line',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  defaultDurationSec: 10,
  description: '小人在数轴上跳跃前进，学习数字顺序和位置',
  params: [
    {
      name: 'startNum',
      type: 'number',
      required: false,
      defaultValue: 0,
      label: '起始数字',
    },
    {
      name: 'endNum',
      type: 'number',
      required: false,
      defaultValue: 10,
      label: '结束数字',
    },
    {
      name: 'highlightNum',
      type: 'number',
      required: false,
      defaultValue: 5,
      label: '高亮数字',
    },
    {
      name: 'hopSequence',
      type: 'number[]',
      required: false,
      defaultValue: [1, 3, 5],
      label: '跳跃序列',
    },
  ],
});

// ── Sketch registration ──

registerP5Sketch('math.number-line', (p: p5, params: Record<string, unknown>) => {
  const startNum = (params.startNum as number) ?? 0;
  const endNum = (params.endNum as number) ?? 10;
  const highlightNum = (params.highlightNum as number) ?? 5;
  const hopSequence = (params.hopSequence as number[]) || [1, 3, 5];

  // Clamp hopSequence values to range
  const validHops = hopSequence.filter((n) => n >= startNum && n <= endNum);

  interface Sparkle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
  }

  const sparkles: Sparkle[] = [];
  let currentHopIndex = 0;
  let hopStartTime = 0;
  const hopInterval = 1500; // ms between hops
  const hopDuration = 600; // ms for one hop arc
  let startTime = 0;
  let characterX = 0;
  let characterBaseY = 0;
  let characterSquashX = 1;
  let characterSquashY = 1;
  let sparkleTriggered = false;

  /** Map a number to its x position on the number line */
  function numToX(num: number): number {
    const range = endNum - startNum;
    if (range <= 0) return p.width / 2;
    const padding = p.width * 0.1;
    const usableWidth = p.width - padding * 2;
    return padding + ((num - startNum) / range) * usableWidth;
  }

  /** Line y-coordinate */
  function lineY(): number {
    return p.height * 0.6;
  }

  /** Spawn sparkle particles at given position */
  function spawnSparkles(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = p.random(p.TWO_PI);
      const speed = p.random(1, 4);
      sparkles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        maxLife: p.random(30, 60),
        size: p.random(3, 8),
      });
    }
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    p.textAlign(p.CENTER, p.CENTER);
    startTime = p.millis();

    // Place character at the first hop target (or startNum)
    const firstTarget = validHops.length > 0 ? validHops[0] : startNum;
    characterX = numToX(firstTarget);
    characterBaseY = lineY() - 25;
    hopStartTime = startTime + 600;
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    const target = currentHopIndex < validHops.length
      ? validHops[currentHopIndex]
      : (validHops.length > 0 ? validHops[validHops.length - 1] : startNum);
    characterX = numToX(target);
    characterBaseY = lineY() - 25;
  };

  p.draw = () => {
    p.background(255, 253, 248);
    const now = p.millis();
    const ly = lineY();

    // ── Title ──
    p.push();
    p.textSize(18);
    p.fill(80, 80, 100);
    p.textStyle(p.BOLD);
    p.text('\u6570\u5B57\u8DF3\u8DF3\u8DF3', p.width / 2, p.height * 0.07);
    p.pop();

    // ── Draw number line ──
    const linePadding = p.width * 0.1;
    p.push();
    p.stroke(120, 130, 150);
    p.strokeWeight(3);
    p.line(linePadding, ly, p.width - linePadding, ly);

    // Tick marks and numbers
    for (let n = startNum; n <= endNum; n++) {
      const x = numToX(n);
      const isHighlight = n === highlightNum;
      const tickH = isHighlight ? 18 : 12;

      p.strokeWeight(isHighlight ? 3 : 2);
      p.stroke(isHighlight ? p.color('#F59E0B') : p.color(120, 130, 150));
      p.line(x, ly - tickH / 2, x, ly + tickH / 2);

      p.noStroke();
      p.textSize(isHighlight ? 22 : 16);
      p.textStyle(isHighlight ? p.BOLD : p.NORMAL);
      p.fill(isHighlight ? p.color('#D97706') : p.color(80, 80, 100));
      p.text(String(n), x, ly + 28);

      // Highlight circle
      if (isHighlight) {
        p.noFill();
        p.stroke(p.color('#F59E0B'));
        p.strokeWeight(2);
        p.ellipse(x, ly + 28, 30, 30);
      }
    }
    p.pop();

    // ── Hop animation logic ──
    if (validHops.length > 0 && currentHopIndex < validHops.length) {
      const hopElapsed = now - hopStartTime;

      if (hopElapsed > 0) {
        const t = Math.min(1, hopElapsed / hopDuration);

        // Previous position
        const prevNum = currentHopIndex > 0 ? validHops[currentHopIndex - 1] : startNum;
        // If first hop, animate from startNum; otherwise from previous hop
        const fromX = currentHopIndex === 0 ? numToX(startNum) : numToX(prevNum);
        const toX = numToX(validHops[currentHopIndex]);

        // Ease in-out cubic
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        characterX = p.lerp(fromX, toX, ease);

        // Arc (parabolic jump)
        const jumpHeight = 50 + Math.abs(toX - fromX) * 0.08;
        const arcY = -jumpHeight * Math.sin(t * Math.PI);

        // Squash-stretch
        if (t < 0.15) {
          // Launch squash
          const sq = t / 0.15;
          characterSquashX = 1 + 0.2 * (1 - sq);
          characterSquashY = 1 - 0.2 * (1 - sq);
        } else if (t < 0.5) {
          // Air stretch
          characterSquashX = 0.85;
          characterSquashY = 1.15;
        } else if (t > 0.85) {
          // Landing squash
          const sq = (t - 0.85) / 0.15;
          characterSquashX = 1 + 0.25 * (1 - sq);
          characterSquashY = 1 - 0.2 * (1 - sq);
        } else {
          // Descending stretch
          characterSquashX = p.lerp(characterSquashX, 1, 0.1);
          characterSquashY = p.lerp(characterSquashY, 1, 0.1);
        }

        // Character Y offset during jump
        const baseY = ly - 25;
        characterBaseY = baseY + arcY;

        // Advance to next hop
        if (t >= 1) {
          characterX = toX;
          characterBaseY = baseY;
          characterSquashX = 1;
          characterSquashY = 1;

          // Check if we landed on highlight
          if (validHops[currentHopIndex] === highlightNum && !sparkleTriggered) {
            sparkleTriggered = true;
            spawnSparkles(characterX, characterBaseY, 25);
          }

          currentHopIndex++;
          hopStartTime = now + (hopInterval - hopDuration);
          if (currentHopIndex < validHops.length) {
            sparkleTriggered = false;
          }
        }
      }
    }

    // ── Draw character (circle with face) ──
    p.push();
    p.translate(characterX, characterBaseY);
    p.scale(characterSquashX, characterSquashY);

    // Body
    p.noStroke();
    p.fill(p.color('#6366F1'));
    p.ellipse(0, 0, 36, 36);

    // Eyes
    p.fill(255);
    p.ellipse(-7, -4, 10, 12);
    p.ellipse(7, -4, 10, 12);
    p.fill(40);
    p.ellipse(-6, -3, 5, 6);
    p.ellipse(8, -3, 5, 6);

    // Smile
    p.noFill();
    p.stroke(40);
    p.strokeWeight(2);
    p.arc(0, 3, 14, 10, 0.1, Math.PI - 0.1);

    // Blush
    p.noStroke();
    p.fill(255, 150, 150, 80);
    p.ellipse(-14, 4, 8, 5);
    p.ellipse(14, 4, 8, 5);

    p.pop();

    // ── Update & draw sparkles ──
    p.push();
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const sp = sparkles[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += 0.08; // gravity
      sp.life -= 1 / sp.maxLife;

      if (sp.life <= 0) {
        sparkles.splice(i, 1);
        continue;
      }

      const alpha = sp.life * 255;
      p.noStroke();
      p.fill(255, 200, 50, alpha);
      p.push();
      p.translate(sp.x, sp.y);
      p.rotate(sp.life * 4);
      // Diamond sparkle shape
      p.beginShape();
      p.vertex(0, -sp.size / 2);
      p.vertex(sp.size / 4, 0);
      p.vertex(0, sp.size / 2);
      p.vertex(-sp.size / 4, 0);
      p.endShape(p.CLOSE);
      p.pop();
    }
    p.pop();

    // ── Hop path indicator ──
    if (validHops.length > 0) {
      p.push();
      p.noFill();
      p.stroke(100, 130, 200, 40);
      p.strokeWeight(2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.drawingContext as any).setLineDash([4, 6]);
      for (let i = 0; i < validHops.length; i++) {
        const fromNum = i === 0 ? startNum : validHops[i - 1];
        const toNum = validHops[i];
        p.line(numToX(fromNum), ly, numToX(toNum), ly);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.drawingContext as any).setLineDash([]);
      p.pop();
    }
  };
});
