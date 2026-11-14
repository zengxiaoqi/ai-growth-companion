const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const servicePath = path.join(
  backendDir,
  'src',
  'modules',
  'learning',
  'video-generation-agent.service.ts',
);
const remotionDir = path.join(backendDir, '..', 'video-remotion');
const previewDir = path.join(remotionDir, 'src', '__preview');

const source = fs.readFileSync(servicePath, 'utf8');
const anchor = 'return String.raw`';
const start = source.indexOf(anchor);
const bodyStart = start + anchor.length;
const end = source.indexOf('`;', bodyStart);
if (start < 0 || end < 0) {
  console.error('template extraction failed');
  process.exit(1);
}

const template = source
  .slice(bodyStart, end)
  .replace('${JSON.stringify(ANIMAL_EMOJI_MAP)}', '{}');

const scenes = [
  {
    id: 's1',
    title: '认识老虎',
    narration: '小朋友，看这只大老虎。它的身上有一条一条黑色的条纹，尾巴又粗又长，走起路来非常有力量。',
    onScreenText: '老虎 · 条纹与尾巴',
    visualDescription: 'tiger running in forest',
    assetKey: 'tiger',
    assetTags: ['tiger'],
    action: 'run',
    habitat: 'forest',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#D85A30',
    domain: 'science',
    visualAssets: {
      characterAssetSrc: 'assets/lesson/animals/tiger-running.svg',
      backgroundAssetSrc: 'assets/lesson/backgrounds/forest-day.svg',
      hasCharacterAsset: true,
      assetProvider: 'local',
      license: 'cc0',
      qualityScore: 88,
    },
  },
  {
    id: 's2',
    title: '水去哪里了',
    narration: '太阳把水晒热，水变成看不见的水汽飞到天上，遇冷又变回小水珠落下来。',
    onScreenText: '蒸发 · 凝结 · 降雨',
    visualDescription: 'water cycle',
    assetKey: 'topic',
    assetTags: [],
    action: 'idle',
    habitat: 'river',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#378ADD',
    domain: 'science',
  },
  {
    id: 's3',
    title: '数一数有几颗',
    narration: '我们把小圆点一个一个数出来，数到最后一个数字，就是它们的总数。',
    onScreenText: '',
    visualDescription: 'counting dots',
    assetKey: 'topic',
    assetTags: [],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#1D9E75',
    domain: 'math',
  },
  {
    id: 's4',
    title: '认识老虎',
    narration: '小朋友，看这只大老虎。它的身上有一条一条黑色的条纹，尾巴又粗又长。',
    onScreenText: '老虎 · 条纹与尾巴',
    visualDescription: 'tiger in forest',
    assetKey: 'tiger',
    assetTags: ['tiger'],
    action: 'idle',
    habitat: 'forest',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#D85A30',
    domain: 'science',
    visualAssets: {
      characterAssetSrc: 'assets/vector/animals/tiger.svg',
      backgroundAssetSrc: 'assets/lesson/backgrounds/forest-day.svg',
      hasCharacterAsset: true,
      assetProvider: 'vector',
      license: 'mit',
      qualityScore: 92,
    },
  },
];

const rootSource = `import React from "react";
import { Composition } from "remotion";
import { GeneratedLesson } from "./GeneratedLesson";

const SCENES = ${JSON.stringify(scenes)};
const TOTAL = SCENES.reduce((sum, scene) => sum + scene.durationFrames, 0);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LessonPreview"
      component={GeneratedLesson}
      durationInFrames={TOTAL}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ title: "灵犀伴学", topic: "认识老虎", scenes: SCENES, durationFrames: TOTAL }}
    />
  );
};
`;

const indexSource = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
`;

fs.mkdirSync(previewDir, { recursive: true });
fs.writeFileSync(path.join(previewDir, 'GeneratedLesson.tsx'), template, 'utf8');
fs.writeFileSync(path.join(previewDir, 'Root.tsx'), rootSource, 'utf8');
fs.writeFileSync(path.join(previewDir, 'index.ts'), indexSource, 'utf8');

console.log('preview_dir=' + previewDir);
console.log('frames_total=' + scenes.reduce((sum, scene) => sum + scene.durationFrames, 0));
