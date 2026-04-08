/**
 * Counting objects animation template.
 * Objects appear one-by-one with bounce, counter increments with pop,
 * and the final number pulses/glow when all objects are shown.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/AnimationRenderer';

// ── Template registration ──

registerTemplate({
  id: 'math.counting-objects',
  domain: 'math',
  subcategory: 'counting',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  defaultDurationSec: 8,
  description: '物体逐一出现并计数，展示数字与数量的对应关系',
  params: [
    {
      name: 'objectType',
      type: 'string',
      required: false,
      defaultValue: 'star',
      label: '物体类型',
    },
    {
      name: 'targetCount',
      type: 'number',
      required: true,
      defaultValue: 5,
      label: '目标数量',
    },
    {
      name: 'objectColor',
      type: 'color',
      required: false,
      defaultValue: '#EF4444',
      label: '物体颜色',
    },
  ],
});

// ── Sketch registration ──

registerP5Sketch('math.counting-objects', (p: p5, params: Record<string, unknown>) => {
  const objectType = (params.objectType as string) || 'star';
  const targetCount = (params.targetCount as number) || 5;
  const objectColor = (params.objectColor as string) || '#EF4444';

  /** One entry per counted object */
  interface ObjectState {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    scale: number;
    targetScale: number;
    appeared: boolean;
    appearTime: number;
  }

  const objects: ObjectState[] = [];
  let currentCount = 0;
  let counterScale = 1;
  let counterTargetScale = 1;
  let startTime = 0;
  const objectInterval = 800; // ms between each object appearance
  const bounceDuration = 500; // ms for bounce animation
  let allAppeared = false;
  let finalPulsePhase = 0;

  /** Calculate grid layout positions */
  function layoutPositions(): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];
    const cols = Math.min(targetCount, Math.ceil(Math.sqrt(targetCount)));
    const rows = Math.ceil(targetCount / cols);
    const spacingX = p.width / (cols + 1);
    const spacingY = (p.height * 0.5) / (rows + 1);
    const offsetY = p.height * 0.2;

    for (let i = 0; i < targetCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.push({
        x: spacingX * (col + 1),
        y: offsetY + spacingY * (row + 1),
      });
    }
    return positions;
  }

  /** Draw the chosen shape at the origin, to be transformed by caller */
  function drawShape(size: number): void {
    const s = size;
    switch (objectType) {
      case 'apple':
        p.ellipse(0, 0, s, s * 0.9);
        // stem
        p.rect(-s * 0.04, -s * 0.55, s * 0.08, s * 0.2, 2);
        // leaf
        p.ellipse(s * 0.1, -s * 0.45, s * 0.2, s * 0.1);
        break;
      case 'ball':
        p.ellipse(0, 0, s, s);
        // highlight
        p.fill(255, 255, 255, 80);
        p.ellipse(-s * 0.15, -s * 0.15, s * 0.25, s * 0.2);
        break;
      case 'heart':
        p.beginShape();
        for (let a = 0; a < p.TWO_PI; a += 0.1) {
          const hx = s * 0.25 * 16 * Math.pow(Math.sin(a), 3) / 16;
          const hy = -s * 0.25 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16;
          p.vertex(hx, hy);
        }
        p.endShape(p.CLOSE);
        break;
      case 'star':
      default:
        p.beginShape();
        for (let i = 0; i < 10; i++) {
          const angle = (p.TWO_PI / 10) * i - p.HALF_PI;
          const r = i % 2 === 0 ? s * 0.5 : s * 0.22;
          p.vertex(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        p.endShape(p.CLOSE);
        break;
    }
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    p.textAlign(p.CENTER, p.CENTER);
    startTime = p.millis();

    const positions = layoutPositions();
    for (let i = 0; i < targetCount; i++) {
      objects.push({
        x: positions[i].x,
        y: positions[i].y - 60,
        targetX: positions[i].x,
        targetY: positions[i].y,
        scale: 0,
        targetScale: 1,
        appeared: false,
        appearTime: startTime + i * objectInterval + 500,
      });
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    const positions = layoutPositions();
    for (let i = 0; i < objects.length; i++) {
      objects[i].targetX = positions[i].x;
      objects[i].targetY = positions[i].y;
      if (objects[i].appeared) {
        objects[i].x = positions[i].x;
        objects[i].y = positions[i].y;
      }
    }
  };

  p.draw = () => {
    p.background(255, 253, 248);
    const now = p.millis();
    const col = p.color(objectColor);

    // ── Counter display (top center) ──
    currentCount = 0;
    for (let i = 0; i < objects.length; i++) {
      if (objects[i].appeared) currentCount++;
    }

    // Counter pop animation
    counterScale = p.lerp(counterScale, counterTargetScale, 0.15);
    if (counterTargetScale > 1 && counterScale > 1.18) {
      counterTargetScale = 1;
    }

    // Final pulse
    if (currentCount === targetCount) {
      if (!allAppeared) {
        allAppeared = true;
        finalPulsePhase = 0;
      }
      finalPulsePhase += 0.05;
      counterScale = 1 + Math.sin(finalPulsePhase) * 0.1;
    }

    // Draw counter
    p.push();
    p.translate(p.width / 2, p.height * 0.1);
    p.scale(counterScale);
    p.textSize(64);
    p.fill(50, 50, 70);
    p.textStyle(p.BOLD);
    p.text(String(currentCount), 0, 0);

    // Glow behind counter when all appeared
    if (allAppeared) {
      const glowAlpha = 60 + Math.sin(finalPulsePhase * 1.5) * 40;
      p.noStroke();
      p.fill(p.red(col), p.green(col), p.blue(col), glowAlpha);
      p.ellipse(0, 0, 120, 120);
    }
    p.pop();

    // ── Draw objects ──
    const objSize = Math.min(60, p.width / (targetCount + 2));

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];

      if (!obj.appeared && now >= obj.appearTime) {
        obj.appeared = true;
        counterTargetScale = 1.3; // trigger pop
      }

      if (!obj.appeared) continue;

      // Bounce easing
      const elapsed = now - obj.appearTime;
      const t = Math.min(1, elapsed / bounceDuration);

      // Elastic ease-out approximation
      const ease = t < 1
        ? 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 * Math.PI) / 3)
        : 1;

      obj.scale = ease * obj.targetScale;
      obj.y = p.lerp(obj.targetY - 60, obj.targetY, ease);

      p.push();
      p.translate(obj.x, obj.y);
      p.scale(obj.scale);
      p.noStroke();
      p.fill(col);
      drawShape(objSize);
      p.pop();
    }

    // ── Decorative label ──
    p.push();
    p.textSize(18);
    p.fill(150, 150, 160);
    p.textStyle(p.NORMAL);
    const typeNames: Record<string, string> = {
      apple: '数苹果',
      star: '数星星',
      ball: '数球',
      heart: '数爱心',
    };
    p.text(typeNames[objectType] || '数一数', p.width / 2, p.height * 0.1 + 45);
    p.pop();
  };
});
