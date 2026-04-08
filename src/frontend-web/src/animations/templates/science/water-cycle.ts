/**
 * Water cycle animation template.
 * Demonstrates evaporation, condensation, precipitation, and collection.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/AnimationRenderer';

// ── Template registration ──

registerTemplate({
  id: 'science.water-cycle',
  domain: 'science',
  subcategory: 'earth-science',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'speed',
      type: 'number',
      required: false,
      defaultValue: 1,
      label: '动画速度',
    },
    {
      name: 'showLabels',
      type: 'boolean',
      required: false,
      defaultValue: true,
      label: '显示标签',
    },
  ],
  defaultDurationSec: 15,
  description: '水循环动画：展示蒸发、凝结、降水和汇流四个阶段',
});

// ── Sketch registration ──

registerP5Sketch('science.water-cycle', (p: p5, params: Record<string, unknown>) => {
  const speed = (params.speed as number) || 1;
  const showLabels = params.showLabels !== false;

  // Phase timing (0-1 normalized cycle position)
  // 0.00-0.25 evaporation
  // 0.25-0.50 condensation / cloud
  // 0.50-0.75 precipitation
  // 0.75-1.00 collection

  let cycleT = 0;

  // Particle arrays
  interface Vapour {
    x: number;
    y: number;
    vy: number;
    alpha: number;
  }

  interface RainDrop {
    x: number;
    y: number;
    vy: number;
    alpha: number;
  }

  let vapourParticles: Vapour[] = [];
  let rainDrops: RainDrop[] = [];

  // Layout constants (set in setup)
  let waterY = 0;
  let sunX = 0;
  let sunY = 0;
  let cloudX = 0;
  let cloudBaseY = 0;

  p.setup = () => {
    p.createCanvas(640, 400);
    p.textAlign(p.CENTER, p.CENTER);

    waterY = p.height * 0.78;
    sunX = p.width * 0.12;
    sunY = p.height * 0.15;
    cloudX = p.width * 0.5;
    cloudBaseY = p.height * 0.18;
  };

  p.draw = () => {
    const dt = (p.deltaTime / 1000) * speed;
    cycleT = (cycleT + dt * 0.06) % 1;

    drawBackground();
    drawSun();
    drawWater();

    // Evaporation phase
    if (cycleT < 0.30) {
      spawnVapour(dt);
    }
    updateVapour(dt);
    drawVapour();

    // Cloud grows during condensation
    drawCloud();

    // Precipitation phase
    if (cycleT > 0.45 && cycleT < 0.75) {
      spawnRain(dt);
    }
    updateRain(dt);
    drawRain();

    // Collection splashes at water surface
    if (cycleT > 0.60) {
      drawSplashes();
    }

    if (showLabels) {
      drawLabels();
    }
  };

  // ── Drawing helpers ──

  function drawBackground() {
    // Sky gradient
    for (let y = 0; y < waterY; y++) {
      const t = y / waterY;
      const r = p.lerp(135, 200, t);
      const g = p.lerp(206, 230, t);
      const b = p.lerp(235, 245, t);
      p.stroke(r, g, b);
      p.line(0, y, p.width, y);
    }

    // Ground below water
    p.noStroke();
    p.fill(139, 119, 101);
    p.rect(0, waterY + 40, p.width, p.height - waterY - 40);
  }

  function drawSun() {
    const pulse = p.sin(p.frameCount * 0.03) * 4;
    // Glow
    p.noStroke();
    p.fill(255, 220, 50, 40);
    p.ellipse(sunX, sunY, 90 + pulse, 90 + pulse);
    p.fill(255, 220, 50, 80);
    p.ellipse(sunX, sunY, 65 + pulse * 0.5, 65 + pulse * 0.5);
    // Core
    p.fill(255, 200, 0);
    p.ellipse(sunX, sunY, 50, 50);
    // Rays
    p.stroke(255, 200, 0, 150);
    p.strokeWeight(2);
    for (let i = 0; i < 8; i++) {
      const a = (i * p.TWO_PI) / 8 + p.frameCount * 0.005;
      const r1 = 30;
      const r2 = 45 + pulse * 0.3;
      p.line(
        sunX + p.cos(a) * r1,
        sunY + p.sin(a) * r1,
        sunX + p.cos(a) * r2,
        sunY + p.sin(a) * r2,
      );
    }
    p.noStroke();
  }

  function drawWater() {
    // Wavy water surface
    p.fill(64, 164, 223, 180);
    p.noStroke();
    p.beginShape();
    for (let x = 0; x <= p.width; x += 4) {
      const wave = p.sin(x * 0.02 + p.frameCount * 0.02) * 4;
      p.vertex(x, waterY + wave);
    }
    p.vertex(p.width, p.height);
    p.vertex(0, p.height);
    p.endShape(p.CLOSE);

    // Secondary wave for depth
    p.fill(40, 130, 200, 100);
    p.beginShape();
    for (let x = 0; x <= p.width; x += 4) {
      const wave = p.sin(x * 0.025 + p.frameCount * 0.03 + 1) * 3;
      p.vertex(x, waterY + 8 + wave);
    }
    p.vertex(p.width, p.height);
    p.vertex(0, p.height);
    p.endShape(p.CLOSE);
  }

  function spawnVapour(dt: number) {
    const count = Math.floor(dt * 15);
    for (let i = 0; i < count; i++) {
      vapourParticles.push({
        x: p.random(p.width * 0.25, p.width * 0.75),
        y: waterY - 5,
        vy: -p.random(20, 50),
        alpha: p.random(100, 200),
      });
    }
  }

  function updateVapour(dt: number) {
    vapourParticles = vapourParticles.filter((v) => {
      v.y += v.vy * dt;
      v.alpha -= 60 * dt;
      v.x += p.sin(v.y * 0.05 + p.frameCount * 0.01) * 0.3;
      return v.alpha > 0 && v.y > cloudBaseY - 20;
    });
  }

  function drawVapour() {
    p.noStroke();
    for (const v of vapourParticles) {
      p.fill(255, 255, 255, v.alpha);
      p.ellipse(v.x, v.y, 8, 8);
    }
  }

  function drawCloud() {
    const cloudSize = cycleT < 0.25 ? p.map(cycleT, 0, 0.25, 0.4, 1) : 1;
    const baseAlpha = cycleT < 0.25 ? p.map(cycleT, 0, 0.25, 150, 240) : 240;

    p.noStroke();
    // Cloud puffs
    const puffs = [
      { dx: -40, dy: 0, r: 30 },
      { dx: -15, dy: -15, r: 35 },
      { dx: 15, dy: -10, r: 38 },
      { dx: 40, dy: 0, r: 30 },
      { dx: 0, dy: 5, r: 32 },
    ];

    for (const puff of puffs) {
      const r = puff.r * cloudSize;
      p.fill(255, 255, 255, baseAlpha);
      p.ellipse(cloudX + puff.dx, cloudBaseY + puff.dy, r * 2, r * 1.4);
    }

    // Darken cloud when about to rain
    if (cycleT > 0.40 && cycleT < 0.75) {
      const dark = p.map(cycleT, 0.40, 0.55, 0, 1);
      for (const puff of puffs) {
        const r = puff.r * cloudSize;
        p.fill(160, 170, 180, dark * 120);
        p.ellipse(cloudX + puff.dx, cloudBaseY + puff.dy, r * 2, r * 1.4);
      }
    }
  }

  function spawnRain(dt: number) {
    const count = Math.floor(dt * 25);
    for (let i = 0; i < count; i++) {
      rainDrops.push({
        x: p.random(cloudX - 60, cloudX + 60),
        y: cloudBaseY + 25,
        vy: p.random(150, 280),
        alpha: p.random(150, 220),
      });
    }
  }

  function updateRain(dt: number) {
    rainDrops = rainDrops.filter((d) => {
      d.y += d.vy * dt;
      d.alpha -= 20 * dt;
      return d.alpha > 0 && d.y < waterY;
    });
  }

  function drawRain() {
    p.stroke(100, 149, 237);
    p.strokeWeight(2);
    for (const d of rainDrops) {
      p.stroke(100, 149, 237, d.alpha);
      p.line(d.x, d.y, d.x - 1, d.y + 8);
    }
    p.noStroke();
  }

  function drawSplashes() {
    const splashAlpha = p.map(cycleT, 0.60, 0.80, 0, 200);
    if (splashAlpha <= 0) return;

    p.noFill();
    p.stroke(100, 180, 255, Math.min(splashAlpha, 150));
    p.strokeWeight(1.5);
    for (let i = 0; i < 5; i++) {
      const sx = cloudX + p.random(-50, 50);
      const sy = waterY;
      p.arc(sx, sy, p.random(6, 14), p.random(4, 8), p.PI, p.TWO_PI);
    }
    p.noStroke();
  }

  function drawLabels() {
    p.fill(50, 50, 80);
    p.noStroke();
    p.textSize(13);
    p.textStyle(p.BOLD);

    if (cycleT < 0.30) {
      p.text('蒸发', p.width * 0.35, waterY - 35);
      // Arrow pointing up
      drawArrow(p.width * 0.35, waterY - 20, p.width * 0.35, waterY - 55, 50);
    } else if (cycleT < 0.50) {
      p.text('凝结', cloudX, cloudBaseY - 45);
    } else if (cycleT < 0.75) {
      p.text('降水', cloudX + 70, cloudBaseY + 60);
      drawArrow(cloudX + 55, cloudBaseY + 45, cloudX + 55, cloudBaseY + 75, 50);
    } else {
      p.text('汇流', p.width * 0.65, waterY + 20);
    }

    // Title
    p.textSize(16);
    p.fill(40, 40, 80);
    p.text('水循环', p.width / 2, 22);
  }

  function drawArrow(x1: number, y1: number, x2: number, y2: number, alpha: number) {
    p.stroke(70, 70, 120, alpha);
    p.strokeWeight(2);
    p.line(x1, y1, x2, y2);
    const angle = p.atan2(y2 - y1, x2 - x1);
    const headLen = 8;
    p.line(
      x2,
      y2,
      x2 - headLen * p.cos(angle - p.PI / 6),
      y2 - headLen * p.sin(angle - p.PI / 6),
    );
    p.line(
      x2,
      y2,
      x2 - headLen * p.cos(angle + p.PI / 6),
      y2 - headLen * p.sin(angle + p.PI / 6),
    );
    p.noStroke();
  }
});
