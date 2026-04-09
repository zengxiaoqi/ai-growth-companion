/**
 * Color mixing animation template.
 * Two colored circles merge together, creating splash particles and showing the result color.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/sketch-registry';

// ── Template registration ──

registerTemplate({
  id: 'art.color-mixing',
  domain: 'art',
  subcategory: 'colors',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'color1',
      type: 'color',
      required: false,
      defaultValue: '#EF4444',
      label: '颜色1',
    },
    {
      name: 'color2',
      type: 'color',
      required: false,
      defaultValue: '#3B82F6',
      label: '颜色2',
    },
    {
      name: 'resultLabel',
      type: 'string',
      required: false,
      defaultValue: '紫色',
      label: '结果颜色名称',
    },
  ],
  defaultDurationSec: 10,
  description: '颜色混合动画：两种颜色混合在一起产生新的颜色',
});

// ── Sketch registration ──

registerP5Sketch('art.color-mixing', (p: p5, params: Record<string, unknown>) => {
  const color1Hex = (params.color1 as string) || '#EF4444';
  const color2Hex = (params.color2 as string) || '#3B82F6';
  const resultLabel = (params.resultLabel as string) || '紫色';

  let c1: p5.Color;
  let c2: p5.Color;
  let mixedColor: p5.Color;

  // Animation phases: 0 = approach, 1 = merge, 2 = splash, 3 = result
  let phase = 0;
  let phaseT = 0;

  // Circle positions
  let leftX: number;
  let rightX: number;
  let centerY: number;
  let circleSize = 70;

  // Splash particles
  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    color: p5.Color;
    alpha: number;
  }

  let particles: Particle[] = [];

  p.setup = () => {
    p.createCanvas(640, 400);
    p.textAlign(p.CENTER, p.CENTER);

    c1 = p.color(color1Hex);
    c2 = p.color(color2Hex);

    // Compute mixed color
    const r1 = p.red(c1);
    const g1 = p.green(c1);
    const b1 = p.blue(c1);
    const r2 = p.red(c2);
    const g2 = p.green(c2);
    const b2 = p.blue(c2);
    mixedColor = p.color((r1 + r2) / 2, (g1 + g2) / 2, (b1 + b2) / 2);

    leftX = p.width * 0.25;
    rightX = p.width * 0.75;
    centerY = p.height * 0.45;
  };

  p.draw = () => {
    const dt = p.deltaTime / 1000;
    phaseT += dt * 0.5;

    // Phase transitions
    if (phase === 0 && phaseT > 1) {
      phase = 1;
      phaseT = 0;
    } else if (phase === 1 && phaseT > 0.8) {
      phase = 2;
      phaseT = 0;
      spawnSplash();
    } else if (phase === 2 && phaseT > 1.5) {
      phase = 3;
      phaseT = 0;
    } else if (phase === 3 && phaseT > 2.5) {
      // Restart cycle
      phase = 0;
      phaseT = 0;
      particles = [];
    }

    drawBackground();

    switch (phase) {
      case 0:
        drawApproach();
        break;
      case 1:
        drawMerge();
        break;
      case 2:
        drawSplash();
        break;
      case 3:
        drawResult();
        break;
    }

    drawLabels();
  };

  function drawBackground() {
    p.background(250, 248, 245);

    // Subtle grid pattern
    p.stroke(230, 225, 220);
    p.strokeWeight(0.5);
    for (let x = 0; x < p.width; x += 30) {
      p.line(x, 0, x, p.height);
    }
    for (let y = 0; y < p.height; y += 30) {
      p.line(0, y, p.width, y);
    }
    p.noStroke();
  }

  function drawApproach() {
    const progress = Math.min(phaseT, 1);
    const eased = easeInOutCubic(progress);

    // Left circle moves right
    const lx = p.lerp(leftX, p.width * 0.5 - 15, eased);
    // Right circle moves left
    const rx = p.lerp(rightX, p.width * 0.5 + 15, eased);

    // Shadow
    p.noStroke();
    p.fill(0, 0, 0, 25);
    p.ellipse(lx + 3, centerY + 5, circleSize, circleSize);
    p.ellipse(rx + 3, centerY + 5, circleSize, circleSize);

    // Circles
    p.fill(c1);
    p.ellipse(lx, centerY, circleSize, circleSize);
    p.fill(c2);
    p.ellipse(rx, centerY, circleSize, circleSize);

    // Color labels below
    p.fill(80);
    p.textSize(14);
    p.textStyle(p.BOLD);
    p.text(color1Hex, lx, centerY + circleSize / 2 + 20);
    p.text(color2Hex, rx, centerY + circleSize / 2 + 20);
  }

  function drawMerge() {
    const progress = Math.min(phaseT / 0.8, 1);
    const eased = easeInOutCubic(progress);

    // Both circles converge to center
    const lx = p.lerp(p.width * 0.5 - 15, p.width * 0.5, eased);
    const rx = p.lerp(p.width * 0.5 + 15, p.width * 0.5, eased);
    const size = p.lerp(circleSize, circleSize * 1.3, eased);

    // Interpolate color
    p.lerpColor(c1, c2, eased * 0.5);

    // Shadow
    p.noStroke();
    p.fill(0, 0, 0, 25);
    p.ellipse(p.width * 0.5 + 3, centerY + 5, size, size);

    // Left circle fading
    if (eased < 0.8) {
      p.fill(p.red(c1), p.green(c1), p.blue(c1), p.lerp(255, 0, eased));
      p.ellipse(lx, centerY, size, size);
    }

    // Right circle fading
    if (eased < 0.8) {
      p.fill(p.red(c2), p.green(c2), p.blue(c2), p.lerp(255, 0, eased));
      p.ellipse(rx, centerY, size, size);
    }

    // Merged circle emerging
    if (eased > 0.3) {
      const mergeAlpha = p.lerp(0, 255, (eased - 0.3) / 0.7);
      p.fill(p.red(mixedColor), p.green(mixedColor), p.blue(mixedColor), mergeAlpha);
      p.ellipse(p.width * 0.5, centerY, size, size);
    }
  }

  function drawSplash() {
    updateParticles();

    // Central merged circle
    const pulseScale = 1 + p.sin(p.frameCount * 0.1) * 0.03;
    const size = circleSize * 1.3 * pulseScale;

    p.noStroke();
    p.fill(0, 0, 0, 25);
    p.ellipse(p.width * 0.5 + 3, centerY + 5, size, size);
    p.fill(mixedColor);
    p.ellipse(p.width * 0.5, centerY, size, size);

    // Particles
    for (const pt of particles) {
      p.fill(pt.color);
      p.ellipse(pt.x, pt.y, pt.r * 2, pt.r * 2);
    }
  }

  function drawResult() {
    const progress = Math.min(phaseT / 1.5, 1);
    const eased = easeOutBack(progress);

    // Central merged circle
    const size = circleSize * 1.5 * eased;

    // Glow
    p.noStroke();
    p.fill(p.red(mixedColor), p.green(mixedColor), p.blue(mixedColor), 30);
    p.ellipse(p.width * 0.5, centerY, size * 1.4, size * 1.4);

    // Shadow
    p.fill(0, 0, 0, 20);
    p.ellipse(p.width * 0.5 + 3, centerY + 5, size, size);

    // Main circle
    p.fill(mixedColor);
    p.ellipse(p.width * 0.5, centerY, size, size);

    // Sparkle highlights
    p.fill(255, 255, 255, 100 * eased);
    p.ellipse(p.width * 0.5 - size * 0.15, centerY - size * 0.15, size * 0.2, size * 0.15);

    // Result label
    if (progress > 0.3) {
      const labelAlpha = p.lerp(0, 255, (progress - 0.3) / 0.7);
      p.fill(60, 60, 80, labelAlpha);
      p.textSize(24);
      p.textStyle(p.BOLD);
      p.text(resultLabel, p.width * 0.5, centerY + size / 2 + 35);

      // Equation
      p.textSize(14);
      p.textStyle(p.NORMAL);
      p.fill(120, 120, 140, labelAlpha);
      p.text(
        `${color1Hex} + ${color2Hex} = ?`,
        p.width * 0.5,
        centerY + size / 2 + 60,
      );
    }
  }

  function spawnSplash() {
    const count = 25;
    for (let i = 0; i < count; i++) {
      const angle = (i * p.TWO_PI) / count + p.random(-0.2, 0.2);
      const speed = p.random(80, 200);
      const useColor = p.random() > 0.5 ? c1 : c2;
      particles.push({
        x: p.width * 0.5,
        y: centerY,
        vx: p.cos(angle) * speed,
        vy: p.sin(angle) * speed,
        r: p.random(3, 8),
        color: useColor,
        alpha: 255,
      });
    }
    // Add some mixed color particles
    for (let i = 0; i < 10; i++) {
      const angle = p.random(p.TWO_PI);
      const speed = p.random(50, 150);
      particles.push({
        x: p.width * 0.5,
        y: centerY,
        vx: p.cos(angle) * speed,
        vy: p.sin(angle) * speed,
        r: p.random(4, 10),
        color: mixedColor,
        alpha: 255,
      });
    }
  }

  function updateParticles() {
    const dt = p.deltaTime / 1000;
    particles = particles.filter((pt) => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.alpha -= 120 * dt;
      pt.r *= 0.995;
      return pt.alpha > 0 && pt.r > 0.5;
    });

    // Update particle alpha in color
    for (const pt of particles) {
      pt.color.setAlpha(pt.alpha);
    }
  }

  function drawLabels() {
    p.fill(80, 80, 100);
    p.textSize(16);
    p.textStyle(p.BOLD);
    p.text('颜色混合', p.width / 2, 25);

    // Phase indicator
    p.textSize(12);
    p.textStyle(p.NORMAL);
    p.fill(150, 150, 160);
    const phaseLabels = ['靠近...', '混合中...', '混合!', '新颜色!'];
    p.text(phaseLabels[phase], p.width / 2, p.height - 20);
  }

  // ── Easing helpers ──

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
});
