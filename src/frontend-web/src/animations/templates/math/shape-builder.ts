/**
 * Shape builder animation template.
 * Geometric shapes slide in from edges, rotate to final orientation,
 * and combine into a composite picture using smooth lerp transitions.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/AnimationRenderer';

// ── Template registration ──

registerTemplate({
  id: 'math.shape-builder',
  domain: 'math',
  subcategory: 'geometry',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  defaultDurationSec: 10,
  description: '几何图形逐一滑入画面，旋转并组合成有趣的图案',
  params: [
    {
      name: 'shapes',
      type: 'string[]',
      required: false,
      defaultValue: ['circle', 'square', 'triangle'],
      label: '图形列表',
    },
    {
      name: 'buildOrder',
      type: 'number[]',
      required: false,
      defaultValue: [0, 1, 2],
      label: '出现顺序',
    },
    {
      name: 'shapeColors',
      type: 'string[]',
      required: false,
      defaultValue: ['#EF4444', '#3B82F6', '#10B981'],
      label: '图形颜色',
    },
  ],
});

// ── Sketch registration ──

registerP5Sketch('math.shape-builder', (p: p5, params: Record<string, unknown>) => {
  const shapes = (params.shapes as string[]) || ['circle', 'square', 'triangle'];
  const buildOrder = (params.buildOrder as number[]) || [0, 1, 2];
  const shapeColors = (params.shapeColors as string[]) || ['#EF4444', '#3B82F6', '#10B981'];

  interface ShapeState {
    shapeType: string;
    color: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    rotation: number;
    targetRotation: number;
    scale: number;
    targetScale: number;
    appearTime: number;
    appeared: boolean;
    settled: boolean;
  }

  const states: ShapeState[] = [];
  const shapeInterval = 1200; // ms between shapes
  const transitionDuration = 1000; // ms for lerp transitions
  let startTime = 0;

  /** Compute target position for each shape in a composite layout */
  function computeTargets(): { x: number; y: number; rotation: number }[] {
    const cx = p.width / 2;
    const cy = p.height / 2;
    const baseSize = Math.min(p.width, p.height) * 0.18;
    const targets: { x: number; y: number; rotation: number }[] = [];

    for (let i = 0; i < shapes.length; i++) {
      const angle = (p.TWO_PI / shapes.length) * i - p.HALF_PI;
      const radius = baseSize * 0.7;
      targets.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        rotation: 0,
      });
    }
    return targets;
  }

  /** Draw a single geometric shape at origin */
  function drawShape(type: string, size: number): void {
    const s = size;
    switch (type) {
      case 'circle':
        p.ellipse(0, 0, s, s);
        break;
      case 'square':
        p.rectMode(p.CENTER);
        p.rect(0, 0, s, s, s * 0.08);
        break;
      case 'triangle':
        p.beginShape();
        p.vertex(0, -s * 0.5);
        p.vertex(s * 0.45, s * 0.35);
        p.vertex(-s * 0.45, s * 0.35);
        p.endShape(p.CLOSE);
        break;
      case 'diamond':
        p.beginShape();
        p.vertex(0, -s * 0.5);
        p.vertex(s * 0.35, 0);
        p.vertex(0, s * 0.5);
        p.vertex(-s * 0.35, 0);
        p.endShape(p.CLOSE);
        break;
      case 'pentagon':
        p.beginShape();
        for (let i = 0; i < 5; i++) {
          const a = (p.TWO_PI / 5) * i - p.HALF_PI;
          p.vertex(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45);
        }
        p.endShape(p.CLOSE);
        break;
      case 'hexagon':
        p.beginShape();
        for (let i = 0; i < 6; i++) {
          const a = (p.TWO_PI / 6) * i;
          p.vertex(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45);
        }
        p.endShape(p.CLOSE);
        break;
      default:
        p.ellipse(0, 0, s, s);
        break;
    }
  }

  /** Pick a starting position at one of the four edges */
  function edgeStart(index: number): { x: number; y: number } {
    const edge = index % 4;
    switch (edge) {
      case 0: return { x: -80, y: p.height / 2 };
      case 1: return { x: p.width + 80, y: p.height / 2 };
      case 2: return { x: p.width / 2, y: -80 };
      default: return { x: p.width / 2, y: p.height + 80 };
    }
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    p.textAlign(p.CENTER, p.CENTER);
    startTime = p.millis();

    const targets = computeTargets();

    for (let orderIdx = 0; orderIdx < buildOrder.length; orderIdx++) {
      const shapeIdx = buildOrder[orderIdx];
      if (shapeIdx < 0 || shapeIdx >= shapes.length) continue;

      const start = edgeStart(shapeIdx);
      const target = targets[shapeIdx];
      const col = shapeColors[shapeIdx % shapeColors.length] || '#888888';

      states.push({
        shapeType: shapes[shapeIdx],
        color: col,
        x: start.x,
        y: start.y,
        startX: start.x,
        startY: start.y,
        targetX: target.x,
        targetY: target.y,
        rotation: p.random(-Math.PI, Math.PI),
        targetRotation: target.rotation,
        scale: 0,
        targetScale: 1,
        appearTime: startTime + orderIdx * shapeInterval + 500,
        appeared: false,
        settled: false,
      });
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth > 800 ? 800 : p.windowWidth, 450);
    const targets = computeTargets();
    for (let i = 0; i < states.length; i++) {
      const t = targets[i];
      states[i].targetX = t.x;
      states[i].targetY = t.y;
      states[i].targetRotation = t.rotation;
      if (states[i].settled) {
        states[i].x = t.x;
        states[i].y = t.y;
      }
    }
  };

  p.draw = () => {
    p.background(248, 250, 252);
    const now = p.millis();
    const shapeSize = Math.min(90, p.width / 7);

    // ── Title ──
    p.push();
    p.textSize(20);
    p.fill(80, 80, 100);
    p.textStyle(p.BOLD);
    p.text('\u56FE\u5F62\u62FC\u4E00\u62FC', p.width / 2, p.height * 0.08);
    p.pop();

    // ── Draw connection lines between settled shapes ──
    p.push();
    p.stroke(200, 205, 215);
    p.strokeWeight(2);
    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        if (states[i].settled && states[j].settled) {
          p.line(states[i].x, states[i].y, states[j].x, states[j].y);
        }
      }
    }
    p.pop();

    // ── Animate each shape ──
    for (let i = 0; i < states.length; i++) {
      const s = states[i];

      if (!s.appeared && now >= s.appearTime) {
        s.appeared = true;
      }

      if (!s.appeared) continue;

      const elapsed = now - s.appearTime;
      const t = Math.min(1, elapsed / transitionDuration);

      // Smooth ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      s.x = p.lerp(s.startX, s.targetX, ease);
      s.y = p.lerp(s.startY, s.targetY, ease);
      s.rotation = p.lerp(s.rotation, s.targetRotation, 0.08);
      s.scale = p.lerp(s.scale, s.targetScale, 0.12);

      if (t >= 1 && !s.settled) {
        s.settled = true;
        s.x = s.targetX;
        s.y = s.targetY;
        s.rotation = s.targetRotation;
        s.scale = 1;
      }

      // Shadow
      p.push();
      p.translate(s.x + 3, s.y + 3);
      p.rotate(s.rotation);
      p.scale(s.scale);
      p.noStroke();
      p.fill(0, 0, 0, 25);
      drawShape(s.shapeType, shapeSize);
      p.pop();

      // Shape
      p.push();
      p.translate(s.x, s.y);
      p.rotate(s.rotation);
      p.scale(s.scale);
      p.noStroke();
      p.fill(p.color(s.color));
      drawShape(s.shapeType, shapeSize);
      p.pop();

      // Label
      if (s.settled) {
        p.push();
        p.textSize(14);
        p.fill(100, 100, 120);
        p.textStyle(p.NORMAL);
        const nameMap: Record<string, string> = {
          circle: '\u5706\u5F62',
          square: '\u6B63\u65B9\u5F62',
          triangle: '\u4E09\u89D2\u5F62',
          diamond: '\u83F1\u5F62',
          pentagon: '\u4E94\u8FB9\u5F62',
          hexagon: '\u516D\u8FB9\u5F62',
        };
        p.text(nameMap[s.shapeType] || s.shapeType, s.x, s.y + shapeSize * 0.55 + 16);
        p.pop();
      }
    }
  };
});
