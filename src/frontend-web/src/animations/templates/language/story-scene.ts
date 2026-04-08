/**
 * Animated story scene template.
 * Renders a simple background (day/night/indoor) with circle-based characters
 * that gently bob, animated clouds/stars, and geometric item shapes.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/AnimationRenderer';

// ── Template definition ──

const TEMPLATE_ID = 'language.story-scene';

registerTemplate({
  id: TEMPLATE_ID,
  domain: 'language',
  subcategory: '故事场景',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'bgType',
      type: 'string',
      required: false,
      defaultValue: 'day',
      label: '背景类型（day/night/indoor）',
    },
    {
      name: 'characters',
      type: 'string[]',
      required: false,
      defaultValue: [],
      label: '角色名称列表',
    },
    {
      name: 'items',
      type: 'string[]',
      required: false,
      defaultValue: [],
      label: '场景物品列表',
    },
  ],
  defaultDurationSec: 15,
  description: '简单动画故事场景，支持白天/夜晚/室内背景，圆形角色带标签会轻轻上下浮动',
});

// ── p5 sketch ──

interface StorySceneParams {
  bgType: 'day' | 'night' | 'indoor';
  characters: string[];
  items: string[];
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

interface Character {
  name: string;
  x: number;
  baseY: number;
  color: string;
  phase: number;
  radius: number;
}

interface SceneItem {
  name: string;
  x: number;
  y: number;
  shape: 'circle' | 'star' | 'square' | 'triangle';
  color: string;
}

const CHARACTER_COLORS = [
  '#F87171', // red
  '#60A5FA', // blue
  '#34D399', // green
  '#FBBF24', // amber
  '#A78BFA', // violet
  '#F472B6', // pink
];

const ITEM_COLORS: Record<string, string> = {
  star: '#FCD34D',
  circle: '#FB923C',
  square: '#6EE7B7',
  triangle: '#93C5FD',
};

const ITEM_SHAPES: Record<string, SceneItem['shape']> = {
  star: 'star',
  circle: 'circle',
  square: 'square',
  triangle: 'triangle',
};

function drawStarShape(p: p5, cx: number, cy: number, r1: number, r2: number, npoints: number): void {
  const angle = p.TWO_PI / npoints;
  const halfAngle = angle / 2.0;
  p.beginShape();
  for (let a = -p.HALF_PI; a < p.TWO_PI - p.HALF_PI; a += angle) {
    const sx = cx + p.cos(a) * r2;
    const sy = cy + p.sin(a) * r2;
    p.vertex(sx, sy);
    const sx2 = cx + p.cos(a + halfAngle) * r1;
    const sy2 = cy + p.sin(a + halfAngle) * r1;
    p.vertex(sx2, sy2);
  }
  p.endShape(p.CLOSE);
}

registerP5Sketch(TEMPLATE_ID, (p: p5, rawParams: Record<string, unknown>) => {
  const bgType = ((rawParams.bgType as string) || 'day') as StorySceneParams['bgType'];
  const characters = (rawParams.characters as string[]) || [];
  const items = (rawParams.items as string[]) || [];

  let canvasW = 480;
  let canvasH = 360;

  // Pre-generated scene elements
  const clouds: Cloud[] = [];
  const stars: Star[] = [];
  const sceneCharacters: Character[] = [];
  const sceneItems: SceneItem[] = [];

  p.setup = () => {
    canvasW = Math.min(p.windowWidth, 520);
    canvasH = 400;
    p.createCanvas(canvasW, canvasH);
    p.pixelDensity(2);
    p.textAlign(p.CENTER, p.CENTER);

    // Generate clouds for day scene
    if (bgType === 'day') {
      for (let i = 0; i < 5; i++) {
        clouds.push({
          x: p.random(canvasW),
          y: p.random(30, 100),
          w: p.random(60, 120),
          speed: p.random(0.2, 0.8),
        });
      }
    }

    // Generate stars for night scene
    if (bgType === 'night') {
      for (let i = 0; i < 40; i++) {
        stars.push({
          x: p.random(canvasW),
          y: p.random(canvasH * 0.6),
          size: p.random(1.5, 4),
          phase: p.random(p.TWO_PI),
          speed: p.random(0.02, 0.06),
        });
      }
    }

    // Place characters along the bottom area
    const charCount = characters.length;
    const spacing = canvasW / (charCount + 1);
    characters.forEach((name, i) => {
      sceneCharacters.push({
        name,
        x: spacing * (i + 1),
        baseY: canvasH - 80,
        color: CHARACTER_COLORS[i % CHARACTER_COLORS.length],
        phase: p.random(p.TWO_PI),
        radius: 28,
      });
    });

    // Place items in the scene
    const itemCount = items.length;
    const itemSpacing = canvasW / (itemCount + 1);
    const shapeKeys = Object.keys(ITEM_SHAPES);
    items.forEach((name, i) => {
      sceneItems.push({
        name,
        x: itemSpacing * (i + 1),
        y: canvasH - 160,
        shape: shapeKeys[i % shapeKeys.length] as SceneItem['shape'],
        color: Object.values(ITEM_COLORS)[i % Object.values(ITEM_COLORS).length],
      });
    });
  };

  p.draw = () => {
    // ── Background ──
    if (bgType === 'day') {
      drawDayBackground(p);
    } else if (bgType === 'night') {
      drawNightBackground(p);
    } else {
      drawIndoorBackground(p);
    }

    // ── Ground line ──
    const groundY = canvasH - 40;
    p.noStroke();
    if (bgType === 'night') {
      p.fill('#1E293B');
    } else if (bgType === 'day') {
      p.fill('#86EFAC');
    } else {
      p.fill('#D6D3D1');
    }
    p.rect(0, groundY, canvasW, 40);

    // Ground line
    p.stroke(bgType === 'night' ? '#334155' : '#6B7280');
    p.strokeWeight(1);
    p.line(0, groundY, canvasW, groundY);

    // ── Draw items ──
    p.noStroke();
    sceneItems.forEach((item) => {
      drawSceneItem(p, item);
    });

    // ── Draw characters ──
    sceneCharacters.forEach((char) => {
      drawCharacter(p, char);
    });
  };

  function drawDayBackground(p: p5): void {
    // Sky gradient: light blue to white
    for (let y = 0; y < canvasH - 40; y++) {
      const inter = p.map(y, 0, canvasH - 40, 0, 1);
      const c = p.lerpColor(p.color('#7DD3FC'), p.color('#F0F9FF'), inter);
      p.stroke(c);
      p.line(0, y, canvasW, y);
    }

    // Sun
    p.noStroke();
    p.fill('#FCD34D');
    const sunX = canvasW - 70;
    const sunY = 60;
    p.ellipse(sunX, sunY, 50, 50);
    // Sun glow
    p.fill(252, 211, 77, 60);
    p.ellipse(sunX, sunY, 70, 70);

    // Clouds
    p.fill('#FFFFFF');
    p.noStroke();
    clouds.forEach((cloud) => {
      cloud.x += cloud.speed;
      if (cloud.x > canvasW + cloud.w) {
        cloud.x = -cloud.w;
      }
      drawCloud(p, cloud.x, cloud.y, cloud.w);
    });
  }

  function drawNightBackground(p: p5): void {
    // Dark blue gradient
    for (let y = 0; y < canvasH - 40; y++) {
      const inter = p.map(y, 0, canvasH - 40, 0, 1);
      const c = p.lerpColor(p.color('#0F172A'), p.color('#1E3A5F'), inter);
      p.stroke(c);
      p.line(0, y, canvasW, y);
    }

    // Moon
    p.noStroke();
    p.fill('#FDE68A');
    const moonX = canvasW - 80;
    const moonY = 60;
    p.ellipse(moonX, moonY, 40, 40);
    // Crescent shadow
    p.fill('#0F172A');
    p.ellipse(moonX + 10, moonY - 4, 32, 36);

    // Twinkling stars
    stars.forEach((star) => {
      star.phase += star.speed;
      const brightness = p.map(p.sin(star.phase), -1, 1, 80, 255);
      p.fill(253, 230, 138, brightness);
      p.noStroke();
      p.ellipse(star.x, star.y, star.size, star.size);
    });
  }

  function drawIndoorBackground(p: p5): void {
    // Room walls
    p.background('#FEF3C7');

    // Wall line
    const wallY = canvasH - 120;
    p.noStroke();
    p.fill('#FDE68A');
    p.rect(0, wallY, canvasW, canvasH - wallY - 40);

    // Wall-floor border
    p.stroke('#D97706');
    p.strokeWeight(2);
    p.line(0, wallY, canvasW, wallY);

    // Window
    const winX = canvasW / 2;
    const winY = 70;
    p.stroke('#92400E');
    p.strokeWeight(2);
    p.fill('#BFDBFE');
    p.rect(winX - 40, winY - 30, 80, 60, 4);
    // Window cross
    p.line(winX, winY - 30, winX, winY + 30);
    p.line(winX - 40, winY, winX + 40, winY);

    // Warm lamp light glow
    p.noStroke();
    p.fill(254, 243, 199, 40);
    p.ellipse(canvasW / 2, 0, canvasW * 0.8, 200);
  }

  function drawCloud(p: p5, x: number, y: number, w: number): void {
    const h = w * 0.4;
    p.ellipse(x, y, w * 0.5, h);
    p.ellipse(x + w * 0.2, y - h * 0.2, w * 0.4, h * 0.8);
    p.ellipse(x - w * 0.2, y - h * 0.1, w * 0.35, h * 0.7);
    p.ellipse(x + w * 0.1, y + h * 0.05, w * 0.6, h * 0.5);
  }

  function drawCharacter(p: p5, char: Character): void {
    const bobOffset = p.sin(p.frameCount * 0.04 + char.phase) * 5;
    const y = char.baseY + bobOffset;

    // Body
    p.noStroke();
    p.fill(char.color);
    p.ellipse(char.x, y, char.radius * 2, char.radius * 2);

    // Face: eyes
    p.fill('#FFFFFF');
    p.ellipse(char.x - 8, y - 4, 10, 12);
    p.ellipse(char.x + 8, y - 4, 10, 12);
    p.fill('#1F2937');
    p.ellipse(char.x - 7, y - 3, 5, 6);
    p.ellipse(char.x + 9, y - 3, 5, 6);

    // Smile
    p.noFill();
    p.stroke('#1F2937');
    p.strokeWeight(1.5);
    p.arc(char.x, y + 4, 14, 10, 0.1, p.PI - 0.1);
    p.noStroke();

    // Name label
    p.fill('#1F2937');
    p.textSize(14);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(char.name, char.x, y + char.radius + 14);
  }

  function drawSceneItem(p: p5, item: SceneItem): void {
    const floatOffset = p.sin(p.frameCount * 0.03 + item.x) * 3;
    const y = item.y + floatOffset;

    p.noStroke();
    p.fill(item.color);

    switch (item.shape) {
      case 'circle':
        p.ellipse(item.x, y, 24, 24);
        break;
      case 'star':
        drawStarShape(p, item.x, y, 6, 14, 5);
        break;
      case 'square':
        p.rectMode(p.CENTER);
        p.rect(item.x, y, 22, 22, 3);
        p.rectMode(p.CORNER);
        break;
      case 'triangle':
        p.triangle(item.x, y - 12, item.x - 12, y + 10, item.x + 12, y + 10);
        break;
    }

    // Item label
    p.fill('#374151');
    p.textSize(11);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(item.name, item.x, y + 20);
  }
});
