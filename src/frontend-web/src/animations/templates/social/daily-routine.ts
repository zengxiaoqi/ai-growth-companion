/**
 * Daily routine timeline animation template.
 * Horizontal timeline with icons and a moving indicator showing daily activities.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/AnimationRenderer';

// ── Template registration ──

registerTemplate({
  id: 'social.daily-routine',
  domain: 'social',
  subcategory: 'daily-life',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'activities',
      type: 'string[]',
      required: false,
      defaultValue: ['起床', '上学', '午餐', '放学', '睡觉'],
      label: '活动列表',
    },
    {
      name: 'highlightIndex',
      type: 'number',
      required: false,
      defaultValue: 0,
      label: '高亮活动索引',
    },
  ],
  defaultDurationSec: 12,
  description: '日程安排动画：展示一天的日常活动时间线',
});

// ── Sketch registration ──

registerP5Sketch('social.daily-routine', (p: p5, params: Record<string, unknown>) => {
  const activities = (params.activities as string[]) || ['起床', '上学', '午餐', '放学', '睡觉'];
  const highlightIdx = Math.max(0, Math.min(activities.length - 1, (params.highlightIndex as number) || 0));

  // Animation state
  let indicatorT = 0; // 0 to activities.length - 1, smoothly animated
  let targetIndicator = highlightIdx;
  let autoAdvanceTimer = 0;

  // Icon definitions per activity keyword
  const iconMap: Record<string, string> = {
    '起床': 'sunrise',
    '上学': 'school',
    '午餐': 'lunch',
    '放学': 'home',
    '睡觉': 'moon',
    '早餐': 'food',
    '晚餐': 'food',
    '运动': 'sport',
    '游戏': 'play',
    '阅读': 'book',
  };

  // Layout
  const timelineY = 200;
  const timelineStartX = 80;
  const timelineEndX = 560;
  const iconSize = 50;
  const spacing = activities.length > 1
    ? (timelineEndX - timelineStartX) / (activities.length - 1)
    : 0;

  // Time labels (fake but plausible)
  const timeLabels = ['7:00', '8:00', '12:00', '16:00', '21:00'];

  p.setup = () => {
    p.createCanvas(640, 400);
    p.textAlign(p.CENTER, p.CENTER);
  };

  p.draw = () => {
    const dt = p.deltaTime / 1000;

    // Auto-advance indicator
    autoAdvanceTimer += dt;
    if (autoAdvanceTimer >= 2.5) {
      autoAdvanceTimer = 0;
      targetIndicator = (targetIndicator + 1) % activities.length;
    }

    // Smooth indicator movement
    indicatorT = p.lerp(indicatorT, targetIndicator, dt * 3);

    drawBackground();
    drawTimelineTrack();
    drawActivityNodes();
    drawIndicator();
    drawTitle();
  };

  function drawBackground() {
    p.background(248, 246, 243);

    // Subtle sky gradient at top
    for (let y = 0; y < 100; y++) {
      const t = y / 100;
      p.stroke(p.lerp(200, 230, t), p.lerp(220, 238, t), p.lerp(255, 245, t));
      p.line(0, y, p.width, y);
    }
    p.noStroke();
  }

  function drawTimelineTrack() {
    // Main track line
    p.stroke(180, 180, 195);
    p.strokeWeight(4);
    p.line(timelineStartX, timelineY, timelineEndX, timelineY);

    // Highlighted portion (up to indicator)
    const indicatorX = timelineStartX + indicatorT * spacing;
    p.stroke(100, 160, 255);
    p.strokeWeight(4);
    p.line(timelineStartX, timelineY, indicatorX, timelineY);
    p.noStroke();
  }

  function drawActivityNodes() {
    for (let i = 0; i < activities.length; i++) {
      const x = timelineStartX + i * spacing;
      const isActive = i === targetIndicator;
      const isPast = i < targetIndicator;
      const isHighlight = i === highlightIdx;

      // Node circle background
      p.noStroke();
      if (isActive) {
        // Glow
        const glowPulse = p.sin(p.frameCount * 0.06) * 8;
        p.fill(100, 160, 255, 40);
        p.ellipse(x, timelineY, iconSize + 20 + glowPulse, iconSize + 20 + glowPulse);

        p.fill(100, 160, 255);
        p.ellipse(x, timelineY, iconSize + 4, iconSize + 4);
      } else if (isPast) {
        p.fill(130, 180, 255);
        p.ellipse(x, timelineY, iconSize + 2, iconSize + 2);
      } else {
        p.fill(230, 230, 235);
        p.ellipse(x, timelineY, iconSize + 2, iconSize + 2);
      }

      // Inner white circle
      p.fill(255);
      p.ellipse(x, timelineY, iconSize - 8, iconSize - 8);

      // Draw icon
      const iconType = iconMap[activities[i]] || 'default';
      drawIcon(x, timelineY, iconType, isActive);

      // Activity label below
      p.noStroke();
      p.textSize(14);
      p.textStyle(p.BOLD);
      if (isActive) {
        p.fill(50, 100, 200);
      } else if (isPast) {
        p.fill(100, 100, 120);
      } else {
        p.fill(160, 160, 175);
      }
      p.text(activities[i], x, timelineY + iconSize / 2 + 20);

      // Time label
      p.textSize(11);
      p.textStyle(p.NORMAL);
      p.fill(160, 160, 175);
      const time = timeLabels[i] || `${7 + i * 3}:00`;
      p.text(time, x, timelineY + iconSize / 2 + 38);

      // Highlight ring for the designated highlight index
      if (isHighlight && !isActive) {
        p.noFill();
        p.stroke(255, 180, 50, 180);
        p.strokeWeight(3);
        p.ellipse(x, timelineY, iconSize + 12, iconSize + 12);
        p.noStroke();
      }
    }
  }

  function drawIcon(x: number, y: number, type: string, active: boolean) {
    const s = 14;
    p.stroke(active ? p.color(50, 100, 200) : p.color(120, 120, 140));
    p.strokeWeight(2);
    p.noFill();

    switch (type) {
      case 'sunrise':
        // Sun with rays
        p.fill(active ? p.color(255, 200, 50) : p.color(220, 180, 80));
        p.noStroke();
        p.ellipse(x, y - 2, s, s);
        p.stroke(active ? p.color(255, 180, 30) : p.color(200, 160, 60));
        p.strokeWeight(1.5);
        p.noFill();
        // Horizon line
        p.line(x - s, y + s * 0.5, x + s, y + s * 0.5);
        break;

      case 'school':
        // Simple school building
        p.fill(active ? p.color(100, 160, 255) : p.color(160, 170, 190));
        p.noStroke();
        p.rect(x - s * 0.6, y - s * 0.3, s * 1.2, s * 1.0);
        // Roof
        p.triangle(x - s * 0.8, y - s * 0.3, x, y - s * 0.9, x + s * 0.8, y - s * 0.3);
        // Door
        p.fill(255);
        p.rect(x - s * 0.15, y + s * 0.2, s * 0.3, s * 0.5);
        break;

      case 'lunch':
      case 'food':
        // Bowl/dome shape
        p.noFill();
        p.arc(x, y, s * 1.2, s * 0.8, p.PI, p.TWO_PI);
        p.line(x - s * 0.6, y, x + s * 0.6, y);
        // Steam
        p.strokeWeight(1);
        for (let i = -1; i <= 1; i++) {
          const sx = x + i * s * 0.25;
          const steamY = y - s * 0.5 + p.sin(p.frameCount * 0.05 + i) * 2;
          p.line(sx, y - s * 0.3, sx, steamY);
        }
        break;

      case 'home':
        // House
        p.fill(active ? p.color(255, 160, 100) : p.color(200, 170, 150));
        p.noStroke();
        p.rect(x - s * 0.5, y - s * 0.1, s, s * 0.8);
        // Roof
        p.fill(active ? p.color(220, 100, 60) : p.color(180, 130, 100));
        p.triangle(x - s * 0.7, y - s * 0.1, x, y - s * 0.8, x + s * 0.7, y - s * 0.1);
        // Window
        p.fill(255, 255, 200);
        p.rect(x - s * 0.15, y + s * 0.05, s * 0.3, s * 0.25);
        break;

      case 'moon':
        // Crescent moon
        p.fill(active ? p.color(200, 200, 255) : p.color(180, 180, 210));
        p.noStroke();
        p.ellipse(x, y, s, s);
        p.fill(active ? p.color(50, 50, 100) : p.color(90, 90, 130));
        p.ellipse(x + s * 0.25, y - s * 0.1, s * 0.7, s * 0.7);
        // Stars
        p.fill(255, 255, 200);
        p.ellipse(x - s * 0.5, y - s * 0.5, 3, 3);
        p.ellipse(x + s * 0.6, y - s * 0.6, 2, 2);
        p.ellipse(x + s * 0.3, y - s * 0.7, 2.5, 2.5);
        break;

      case 'sport':
        // Ball
        p.noFill();
        p.strokeWeight(1.5);
        p.ellipse(x, y, s, s);
        p.arc(x, y, s * 0.5, s, 0, p.PI);
        p.line(x, y - s / 2, x, y + s / 2);
        break;

      case 'play':
        // Star shape
        p.fill(active ? p.color(255, 200, 50) : p.color(220, 190, 100));
        p.noStroke();
        drawStar(x, y, s * 0.3, s * 0.55, 5);
        break;

      case 'book':
        // Open book
        p.noFill();
        p.strokeWeight(1.5);
        p.beginShape();
        p.vertex(x - s * 0.5, y - s * 0.3);
        // @ts-ignore - quadraticVertexTo doesn't exist, convert to bezierVertex
        p.bezierVertex(x - s * 0.5, y + s * 0.3, x, y + s * 0.4 * 0.67, x, y + s * 0.4);
        // @ts-ignore
        p.bezierVertex(x + s * 0.5, y - s * 0.3 * 0.67, x + s * 0.5, y + s * 0.3, x + s * 0.5, y - s * 0.3);
        p.endShape();
        p.line(x, y - s * 0.3, x, y + s * 0.4);
        break;

      default:
        // Generic dot
        p.fill(active ? p.color(100, 160, 255) : p.color(180, 180, 195));
        p.noStroke();
        p.ellipse(x, y, s * 0.6, s * 0.6);
        break;
    }
    p.noStroke();
  }

  function drawStar(cx: number, cy: number, r1: number, r2: number, npoints: number) {
    const angle = p.TWO_PI / npoints;
    const halfAngle = angle / 2;
    p.beginShape();
    for (let a = -p.HALF_PI; a < p.TWO_PI - p.HALF_PI; a += angle) {
      const sx = cx + p.cos(a) * r2;
      const sy = cy + p.sin(a) * r2;
      p.vertex(sx, sy);
      const mx = cx + p.cos(a + halfAngle) * r1;
      const my = cy + p.sin(a + halfAngle) * r1;
      p.vertex(mx, my);
    }
    p.endShape(p.CLOSE);
  }

  function drawIndicator() {
    const indicatorX = timelineStartX + indicatorT * spacing;

    // Moving arrow above timeline
    const arrowY = timelineY - iconSize / 2 - 25;
    const bounce = p.sin(p.frameCount * 0.08) * 3;

    p.noStroke();
    p.fill(255, 120, 50);
    // Arrow triangle
    p.triangle(
      indicatorX - 8,
      arrowY - 10 + bounce,
      indicatorX + 8,
      arrowY - 10 + bounce,
      indicatorX,
      arrowY + bounce,
    );

    // Label above arrow
    p.text('现在', indicatorX, arrowY - 22 + bounce);
  }

  function drawTitle() {
    p.fill(60, 60, 80);
    p.noStroke();
    p.textSize(18);
    p.textStyle(p.BOLD);
    p.text('一天的安排', p.width / 2, 30);

    // Current activity display
    if (targetIndicator < activities.length) {
      p.textSize(13);
      p.textStyle(p.NORMAL);
      p.fill(100, 100, 120);
      p.text(
        `${activities[targetIndicator]} - ${timeLabels[targetIndicator] || ''}`,
        p.width / 2,
        55,
      );
    }
  }
});
