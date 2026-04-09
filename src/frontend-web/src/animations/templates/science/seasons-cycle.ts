/**
 * Seasons cycle animation template.
 * Shows a tree and environment transitioning through spring, summer, autumn, and winter.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/sketch-registry';

const TEMPLATE_ID = 'science.seasons-cycle';

registerTemplate({
  id: TEMPLATE_ID,
  domain: 'science',
  subcategory: 'nature',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'seasonNames',
      type: 'string[]',
      required: false,
      defaultValue: ['春', '夏', '秋', '冬'],
      label: '季节名称列表',
    },
    {
      name: 'focusSeason',
      type: 'number',
      required: false,
      defaultValue: -1,
      label: '聚焦的季节序号(0-春,1-夏,2-秋,3-冬)',
    },
    {
      name: 'showLabels',
      type: 'boolean',
      required: false,
      defaultValue: true,
      label: '是否显示季节标签',
    },
  ],
  defaultDurationSec: 14,
  description: '四季变化动画：同一棵树在春夏秋冬里呈现不同景象，展示花开、绿叶、落叶和飘雪',
});

type SeasonPalette = {
  skyTop: string;
  skyBottom: string;
  ground: string;
  hill: string;
  leaf: string;
  accent: string;
  card: string;
};

const SEASON_PALETTES: SeasonPalette[] = [
  {
    skyTop: '#A7F3D0',
    skyBottom: '#ECFCCB',
    ground: '#86EFAC',
    hill: '#4ADE80',
    leaf: '#F9A8D4',
    accent: '#F472B6',
    card: '#EC4899',
  },
  {
    skyTop: '#7DD3FC',
    skyBottom: '#FEF08A',
    ground: '#4ADE80',
    hill: '#22C55E',
    leaf: '#22C55E',
    accent: '#F59E0B',
    card: '#0EA5E9',
  },
  {
    skyTop: '#FDBA74',
    skyBottom: '#FEF3C7',
    ground: '#A3E635',
    hill: '#84CC16',
    leaf: '#F97316',
    accent: '#DC2626',
    card: '#EA580C',
  },
  {
    skyTop: '#BFDBFE',
    skyBottom: '#E0F2FE',
    ground: '#E5E7EB',
    hill: '#CBD5E1',
    leaf: '#F8FAFC',
    accent: '#60A5FA',
    card: '#3B82F6',
  },
];

function lerpHexColor(p: p5, from: string, to: string, amount: number) {
  return p.lerpColor(p.color(from), p.color(to), amount);
}

function resolveSeasonIndex(frameCount: number, focusSeason: number): number {
  if (focusSeason >= 0 && focusSeason <= 3) return focusSeason;
  return Math.floor((frameCount / 180) % 4);
}

registerP5Sketch(TEMPLATE_ID, (p: p5, rawParams: Record<string, unknown>) => {
  const seasonNames = Array.isArray(rawParams.seasonNames)
    ? (rawParams.seasonNames as string[]).slice(0, 4)
    : ['春', '夏', '秋', '冬'];
  const focusSeason = typeof rawParams.focusSeason === 'number' ? rawParams.focusSeason : -1;
  const showLabels = rawParams.showLabels !== false;

  let canvasW = 480;
  let canvasH = 400;

  p.setup = () => {
    canvasW = Math.min(p.windowWidth, 520);
    canvasH = 400;
    p.createCanvas(canvasW, canvasH);
    p.pixelDensity(2);
    p.textAlign(p.CENTER, p.CENTER);
  };

  p.draw = () => {
    const seasonIndex = resolveSeasonIndex(p.frameCount, focusSeason);
    const nextSeason = (seasonIndex + 1) % 4;
    const transition = focusSeason >= 0 ? 0 : ((p.frameCount / 180) % 1);
    const current = SEASON_PALETTES[seasonIndex];
    const upcoming = SEASON_PALETTES[nextSeason];

    drawSky(current, upcoming, transition);
    drawLandscape(current, upcoming, transition);
    drawTree(current, seasonIndex);
    drawSeasonEffects(seasonIndex);
    if (showLabels) drawSeasonLabels(seasonIndex);
  };

  function drawSky(current: SeasonPalette, upcoming: SeasonPalette, transition: number) {
    for (let y = 0; y < canvasH; y++) {
      const mix = y / canvasH;
      const topColor = lerpHexColor(p, current.skyTop, upcoming.skyTop, transition);
      const bottomColor = lerpHexColor(p, current.skyBottom, upcoming.skyBottom, transition);
      const rowColor = p.lerpColor(topColor, bottomColor, mix);
      p.stroke(rowColor);
      p.line(0, y, canvasW, y);
    }

    const sunX = canvasW * 0.82;
    const sunY = 70;
    p.noStroke();
    p.fill(255, 220, 80, 70);
    p.circle(sunX, sunY, 74);
    p.fill('#FCD34D');
    p.circle(sunX, sunY, 44);
  }

  function drawLandscape(current: SeasonPalette, upcoming: SeasonPalette, transition: number) {
    const hillColor = lerpHexColor(p, current.hill, upcoming.hill, transition);
    const groundColor = lerpHexColor(p, current.ground, upcoming.ground, transition);

    p.noStroke();
    p.fill(hillColor);
    p.ellipse(canvasW * 0.28, canvasH * 0.8, canvasW * 0.6, 150);
    p.ellipse(canvasW * 0.72, canvasH * 0.82, canvasW * 0.7, 170);

    p.fill(groundColor);
    p.rect(0, canvasH - 92, canvasW, 92);
  }

  function drawTree(current: SeasonPalette, seasonIndex: number) {
    const trunkX = canvasW * 0.5;
    const trunkBottom = canvasH - 92;
    const trunkTop = trunkBottom - 120;

    p.stroke('#7C4A22');
    p.strokeWeight(18);
    p.line(trunkX, trunkBottom, trunkX, trunkTop);
    p.strokeWeight(8);
    p.line(trunkX, trunkTop + 30, trunkX - 55, trunkTop - 8);
    p.line(trunkX, trunkTop + 24, trunkX + 48, trunkTop - 16);
    p.line(trunkX, trunkTop + 58, trunkX - 40, trunkTop + 28);
    p.line(trunkX, trunkTop + 50, trunkX + 42, trunkTop + 18);

    if (seasonIndex !== 3) {
      const leafColor = current.leaf;
      const clusters = [
        [trunkX - 46, trunkTop + 12, 56],
        [trunkX + 44, trunkTop + 8, 56],
        [trunkX, trunkTop - 10, 68],
        [trunkX - 6, trunkTop + 42, 70],
      ] as const;
      p.noStroke();
      clusters.forEach(([x, y, size], idx) => {
        p.fill(leafColor);
        p.circle(x, y, size + p.sin((p.frameCount + idx * 16) * 0.03) * 2);
      });

      if (seasonIndex === 0) {
        drawBlossoms(trunkX, trunkTop);
      }
    } else {
      drawSnowOnBranches(trunkX, trunkTop);
    }
  }

  function drawBlossoms(trunkX: number, trunkTop: number) {
    const blossoms = [
      [trunkX - 56, trunkTop + 10],
      [trunkX - 18, trunkTop - 6],
      [trunkX + 24, trunkTop + 6],
      [trunkX + 52, trunkTop + 20],
      [trunkX + 2, trunkTop + 36],
    ] as const;
    p.noStroke();
    blossoms.forEach(([x, y], index) => {
      p.fill(index % 2 === 0 ? '#FCE7F3' : '#F9A8D4');
      p.circle(x, y, 16);
      p.fill('#FBCFE8');
      p.circle(x + 6, y - 4, 10);
    });
  }

  function drawSnowOnBranches(trunkX: number, trunkTop: number) {
    const snowCaps = [
      [trunkX - 52, trunkTop - 8, 16],
      [trunkX + 46, trunkTop - 14, 16],
      [trunkX - 38, trunkTop + 26, 14],
      [trunkX + 36, trunkTop + 18, 14],
    ] as const;
    p.noStroke();
    p.fill('#FFFFFF');
    snowCaps.forEach(([x, y, size]) => p.ellipse(x, y, size, size * 0.75));
  }

  function drawSeasonEffects(seasonIndex: number) {
    switch (seasonIndex) {
      case 0:
        drawPetals();
        break;
      case 1:
        drawButterflies();
        break;
      case 2:
        drawFallingLeaves();
        break;
      case 3:
        drawSnowflakes();
        break;
      default:
        break;
    }
  }

  function drawPetals() {
    p.noStroke();
    for (let i = 0; i < 12; i++) {
      const x = ((i * 67) + p.frameCount * 1.2) % (canvasW + 30) - 15;
      const y = 120 + ((i * 37) % 170) + p.sin((p.frameCount + i * 30) * 0.04) * 8;
      p.fill('#F9A8D4');
      p.ellipse(x, y, 10, 6);
    }
  }

  function drawButterflies() {
    for (let i = 0; i < 4; i++) {
      const x = 90 + i * 95 + p.sin((p.frameCount + i * 40) * 0.05) * 12;
      const y = 120 + i * 26 + p.cos((p.frameCount + i * 35) * 0.06) * 10;
      p.noStroke();
      p.fill('#F472B6');
      p.ellipse(x - 7, y, 12, 16);
      p.ellipse(x + 7, y, 12, 16);
      p.stroke('#7C3AED');
      p.strokeWeight(2);
      p.line(x, y - 8, x, y + 8);
    }
  }

  function drawFallingLeaves() {
    p.noStroke();
    for (let i = 0; i < 10; i++) {
      const x = 50 + i * 46 + p.sin((p.frameCount + i * 28) * 0.03) * 10;
      const y = 80 + ((p.frameCount * 1.4 + i * 30) % 220);
      p.fill(i % 2 === 0 ? '#FB923C' : '#FACC15');
      p.ellipse(x, y, 12, 18);
    }
  }

  function drawSnowflakes() {
    p.stroke('#FFFFFF');
    p.strokeWeight(2);
    for (let i = 0; i < 18; i++) {
      const x = (i * 33 + p.frameCount * 1.1) % canvasW;
      const y = (i * 24 + p.frameCount * 1.8) % canvasH;
      p.line(x - 4, y, x + 4, y);
      p.line(x, y - 4, x, y + 4);
      p.line(x - 3, y - 3, x + 3, y + 3);
      p.line(x - 3, y + 3, x + 3, y - 3);
    }
    p.noStroke();
  }

  function drawSeasonLabels(activeIndex: number) {
    const labels = seasonNames.length === 4 ? seasonNames : ['春', '夏', '秋', '冬'];
    labels.forEach((label, index) => {
      const x = 74 + index * 95;
      const isActive = index === activeIndex;
      p.noStroke();
      p.fill(isActive ? SEASON_PALETTES[index].card : '#FFFFFFCC');
      p.rect(x - 28, 24, 56, 30, 16);
      p.fill(isActive ? '#FFFFFF' : '#6B7280');
      p.textSize(16);
      p.text(label, x, 39);
    });
  }
});
