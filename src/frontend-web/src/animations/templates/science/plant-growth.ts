/**
 * Plant growth animation template.
 * Animated seed growing through stages: seed, sprout, stem, leaves, flower/tree.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/AnimationRenderer';

// ── Template registration ──

registerTemplate({
  id: 'science.plant-growth',
  domain: 'science',
  subcategory: 'biology',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'plantType',
      type: 'string',
      required: false,
      defaultValue: 'flower',
      label: '植物类型',
    },
    {
      name: 'stages',
      type: 'number',
      required: false,
      defaultValue: 5,
      label: '生长阶段数',
    },
  ],
  defaultDurationSec: 12,
  description: '植物生长动画：展示从种子到开花的生长过程',
});

// ── Sketch registration ──

registerP5Sketch('science.plant-growth', (p: p5, params: Record<string, unknown>) => {
  const plantType = (params.plantType as string) || 'flower';
  const totalStages = Math.max(2, Math.min(6, (params.stages as number) || 5));

  let growthProgress = 0; // 0 to 1 across all stages
  const growthSpeed = 0.004;

  // Layout
  let groundY = 0;
  let plantX = 0;

  p.setup = () => {
    p.createCanvas(640, 400);
    groundY = p.height * 0.72;
    plantX = p.width * 0.5;
    p.textAlign(p.CENTER, p.CENTER);
  };

  p.draw = () => {
    growthProgress = Math.min(1, growthProgress + growthSpeed);
    const currentStage = Math.floor(growthProgress * totalStages);
    const stageProgress = (growthProgress * totalStages) % 1;

    drawSky();
    drawGround();
    drawPot();

    // Draw plant based on current stage
    switch (currentStage) {
      case 0:
        drawSeed();
        break;
      case 1:
        drawSeed();
        drawSprout(stageProgress);
        break;
      case 2:
        drawStem(stageProgress);
        drawSeedRemnant();
        break;
      case 3:
        drawFullStem();
        drawLeaves(stageProgress);
        break;
      case 4:
        drawFullStem();
        drawFullLeaves();
        if (totalStages > 4) drawFlower(stageProgress);
        break;
      case 5:
        drawFullStem();
        drawFullLeaves();
        drawFullFlower();
        break;
      default:
        drawFullStem();
        drawFullLeaves();
        drawFullFlower();
        break;
    }

    drawStageLabel(currentStage);
    drawProgressBar();
  };

  // ── Sky ──

  function drawSky() {
    for (let y = 0; y < groundY; y++) {
      const t = y / groundY;
      p.stroke(p.lerp(135, 180, t), p.lerp(206, 220, t), p.lerp(250, 240, t));
      p.line(0, y, p.width, y);
    }

    // Sun
    p.noStroke();
    p.fill(255, 220, 50, 60);
    p.ellipse(p.width * 0.85, p.height * 0.12, 70, 70);
    p.fill(255, 220, 50);
    p.ellipse(p.width * 0.85, p.height * 0.12, 45, 45);
  }

  // ── Ground ──

  function drawGround() {
    p.noStroke();
    // Soil
    p.fill(139, 90, 43);
    p.rect(0, groundY, p.width, p.height - groundY);
    // Darker layer
    p.fill(110, 70, 30);
    p.rect(0, groundY + 15, p.width, p.height - groundY - 15);
    // Soil texture dots
    p.fill(160, 110, 55, 120);
    for (let i = 0; i < 30; i++) {
      const sx = (i * 73 + 17) % p.width;
      const sy = groundY + 5 + ((i * 41 + 11) % 30);
      p.ellipse(sx, sy, 3, 3);
    }
  }

  // ── Flower pot ──

  function drawPot() {
    const potW = 100;
    const potH = 60;
    const potTop = groundY - 5;

    p.noStroke();
    // Pot body (trapezoid)
    p.fill(180, 80, 40);
    p.beginShape();
    p.vertex(plantX - potW / 2, potTop);
    p.vertex(plantX + potW / 2, potTop);
    p.vertex(plantX + potW * 0.4, potTop + potH);
    p.vertex(plantX - potW * 0.4, potTop + potH);
    p.endShape(p.CLOSE);

    // Pot rim
    p.fill(200, 95, 50);
    p.rect(plantX - potW / 2 - 5, potTop - 8, potW + 10, 12, 3);

    // Soil in pot
    p.fill(100, 65, 25);
    p.arc(plantX, potTop + 2, potW - 8, 20, p.PI, p.TWO_PI);
  }

  // ── Seed ──

  function drawSeed() {
    const seedY = groundY - 10;
    p.noStroke();
    p.fill(120, 80, 30);
    p.ellipse(plantX, seedY, 14, 10);
    p.fill(100, 65, 20);
    p.ellipse(plantX - 1, seedY - 1, 10, 7);
  }

  function drawSeedRemnant() {
    const seedY = groundY - 12;
    p.noStroke();
    p.fill(120, 80, 30, 150);
    p.ellipse(plantX, seedY, 10, 7);
  }

  // ── Sprout ──

  function drawSprout(progress: number) {
    const baseY = groundY - 10;
    const sproutHeight = 30 * progress;
    const tipX = plantX + p.sin(progress * 0.5) * 3;
    const tipY = baseY - sproutHeight;

    // Stem
    p.stroke(80, 160, 60);
    p.strokeWeight(3);
    p.noFill();
    p.beginShape();
    p.vertex(plantX, baseY);
    // @ts-ignore - p5 types incorrect, accepts 6 args for 2D cubic bezier
    p.bezierVertex(plantX + 2, baseY - sproutHeight * 0.25, plantX + 1, baseY - sproutHeight * 0.75, tipX, tipY);
    p.endShape();

    // Tiny leaf at tip
    if (progress > 0.5) {
      const leafSize = (progress - 0.5) * 2 * 8;
      p.noStroke();
      p.fill(100, 190, 70);
      p.push();
      p.translate(tipX, tipY);
      p.rotate(-0.3);
      p.ellipse(leafSize * 0.4, 0, leafSize, leafSize * 0.4);
      p.pop();
    }
    p.noStroke();
  }

  // ── Stem ──

  function drawStem(progress: number) {
    const baseY = groundY - 10;
    const maxStemH = 140;
    const stemH = maxStemH * progress;
    const topY = baseY - stemH;

    // Main stem
    p.stroke(60, 140, 50);
    p.strokeWeight(4);
    p.noFill();
    p.beginShape();
    p.vertex(plantX, baseY);
    // @ts-ignore - p5 types are incorrect for 2D bezierVertex (6 args expected by p5 but types only show 5)
    p.bezierVertex(plantX - 3, baseY - stemH * 0.3, plantX + 3, baseY - stemH * 0.6, plantX, topY);
    p.endShape();
    p.noStroke();
  }

  function drawFullStem() {
    const baseY = groundY - 10;
    const stemH = 160;
    const topY = baseY - stemH;

    // Main stem
    p.stroke(50, 130, 40);
    p.strokeWeight(5);
    p.noFill();
    p.beginShape();
    p.vertex(plantX, baseY);
    // @ts-ignore - p5 types are incorrect for 2D bezierVertex (6 args expected by p5 but types only show 5)
    p.bezierVertex(plantX - 4, baseY - stemH * 0.3, plantX + 4, baseY - stemH * 0.7, plantX, topY);
    p.endShape();
    p.noStroke();
  }

  // ── Leaves ──

  function drawLeaves(progress: number) {
    const baseY = groundY - 10;
    const stemH = 160;
    const leafPositions = [
      { yFrac: 0.35, angle: -0.6, side: -1 },
      { yFrac: 0.35, angle: 0.6, side: 1 },
      { yFrac: 0.55, angle: -0.5, side: -1 },
      { yFrac: 0.55, angle: 0.5, side: 1 },
    ];

    const count = Math.floor(progress * leafPositions.length) + 1;
    for (let i = 0; i < Math.min(count, leafPositions.length); i++) {
      const lp = leafPositions[i];
      const leafProgress = i < count - 1 ? 1 : (progress * leafPositions.length) % 1;
      const leafSize = 22 * leafProgress;
      const ly = baseY - stemH * lp.yFrac;
      const lx = plantX + lp.side * 8;

      p.noStroke();
      p.fill(70, 170, 50);
      p.push();
      p.translate(lx, ly);
      p.rotate(lp.angle);
      p.ellipse(lp.side * leafSize * 0.5, 0, leafSize, leafSize * 0.4);
      // Leaf vein
      if (leafProgress > 0.3) {
        p.stroke(50, 140, 35);
        p.strokeWeight(1);
        p.line(0, 0, lp.side * leafSize * 0.7, 0);
        p.noStroke();
      }
      p.pop();
    }
  }

  function drawFullLeaves() {
    const baseY = groundY - 10;
    const stemH = 160;
    const leafPositions = [
      { yFrac: 0.35, angle: -0.6, side: -1 },
      { yFrac: 0.35, angle: 0.6, side: 1 },
      { yFrac: 0.55, angle: -0.5, side: -1 },
      { yFrac: 0.55, angle: 0.5, side: 1 },
    ];

    for (const lp of leafPositions) {
      const leafSize = 26;
      const ly = baseY - stemH * lp.yFrac;
      const lx = plantX + lp.side * 8;

      p.noStroke();
      p.fill(70, 170, 50);
      p.push();
      p.translate(lx, ly);
      p.rotate(lp.angle);
      p.ellipse(lp.side * leafSize * 0.5, 0, leafSize, leafSize * 0.4);
      p.stroke(50, 140, 35);
      p.strokeWeight(1);
      p.line(0, 0, lp.side * leafSize * 0.7, 0);
      p.noStroke();
      p.pop();
    }
  }

  // ── Flower ──

  function drawFlower(progress: number) {
    const topY = groundY - 170;
    const petalCount = 6;
    const petalSize = 18 * progress;

    p.noStroke();
    // Petals
    for (let i = 0; i < petalCount; i++) {
      const angle = (i * p.TWO_PI) / petalCount + p.frameCount * 0.003;
      const px = plantX + p.cos(angle) * petalSize * 0.8;
      const py = topY + p.sin(angle) * petalSize * 0.8;

      if (plantType === 'flower') {
        p.fill(255, 100 + i * 20, 120, 220);
      } else {
        p.fill(255, 200, 50, 220);
      }
      p.ellipse(px, py, petalSize, petalSize * 0.7);
    }

    // Center
    p.fill(255, 220, 50);
    p.ellipse(plantX, topY, 12 * progress, 12 * progress);
  }

  function drawFullFlower() {
    const topY = groundY - 170;
    const petalCount = 6;
    const petalSize = 22;

    p.noStroke();
    for (let i = 0; i < petalCount; i++) {
      const angle = (i * p.TWO_PI) / petalCount + p.frameCount * 0.003;
      const px = plantX + p.cos(angle) * petalSize * 0.9;
      const py = topY + p.sin(angle) * petalSize * 0.9;

      if (plantType === 'flower') {
        p.fill(255, 100 + i * 25, 120);
      } else {
        p.fill(255, 200, 50);
      }
      p.ellipse(px, py, petalSize, petalSize * 0.7);
    }

    // Center
    p.fill(255, 220, 50);
    p.ellipse(plantX, topY, 14, 14);

    // Sway animation
    const sway = p.sin(p.frameCount * 0.02) * 2;
    // tiny floating particles
    p.fill(255, 255, 200, 100);
    for (let i = 0; i < 3; i++) {
      const px = plantX + sway + p.sin(p.frameCount * 0.03 + i * 2) * 15;
      const py = topY - 10 - p.abs(p.sin(p.frameCount * 0.02 + i)) * 10;
      p.ellipse(px, py, 3, 3);
    }
  }

  // ── Stage label ──

  function drawStageLabel(currentStage: number) {
    const labels = ['种子', '发芽', '长茎', '长叶', '开花', '盛放'];
    const labelIdx = Math.min(currentStage, labels.length - 1);

    p.fill(255, 255, 255, 200);
    p.noStroke();
    p.rectMode(p.CENTER);
    p.rect(p.width / 2, 30, 100, 28, 14);
    p.rectMode(p.CORNER);

    p.fill(60, 60, 80);
    p.textSize(15);
    p.textStyle(p.BOLD);
    p.text(labels[labelIdx], p.width / 2, 30);
  }

  // ── Progress bar ──

  function drawProgressBar() {
    const barW = 200;
    const barH = 6;
    const barX = (p.width - barW) / 2;
    const barY = p.height - 25;

    // Background
    p.noStroke();
    p.fill(200, 200, 210);
    p.rect(barX, barY, barW, barH, 3);

    // Fill
    const greenVal = p.map(growthProgress, 0, 1, 180, 80);
    p.fill(80, greenVal, 50);
    p.rect(barX, barY, barW * growthProgress, barH, 3);

    // Stage dots
    for (let i = 0; i < totalStages; i++) {
      const dotX = barX + (barW * i) / (totalStages - 1);
      p.fill(i <= Math.floor(growthProgress * totalStages) ? 255 : 180);
      p.stroke(100);
      p.strokeWeight(1);
      p.ellipse(dotX, barY + barH / 2, 8, 8);
    }
    p.noStroke();
  }
});
