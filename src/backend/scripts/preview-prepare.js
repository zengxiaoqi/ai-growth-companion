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
    title: '水转了一圈',
    narration: '太阳把水晒热，水变成看不见的水汽飞到天上，遇冷又变回小水珠落下来，就这样转了一圈又一圈。',
    onScreenText: '',
    visualDescription: 'water cycle',
    assetKey: 'topic',
    assetTags: ['river'],
    action: 'idle',
    habitat: 'river',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#378ADD',
    domain: 'science',
    sceneGraph: {
      relation: 'cycle',
      caption: '水转一圈又回来了',
      nodes: [
        { id: 'n1', label: '太阳', subject: '太阳', role: 'place' },
        { id: 'n2', label: '水汽', subject: '水蒸气', role: 'abstract', sign: 'rise' },
        { id: 'n3', label: '白云', subject: '白云', role: 'object', swell: 'grow' },
        { id: 'n4', label: '雨滴', subject: '雨', role: 'object' },
      ],
    },
    graphIcons: {
      n1: 'assets/vector/weather/sun.svg',
      n3: 'assets/vector/weather/cloud.svg',
      n4: 'assets/vector/weather/rain.svg',
    },
  },
  {
    id: 's2',
    title: '谁吃掉谁',
    narration: '青草被小兔子吃掉，小兔子又会被狐狸盯上。它们排成一条链子，一环扣着一环。',
    onScreenText: '',
    visualDescription: 'food chain',
    assetKey: 'topic',
    assetTags: [],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#3E8E5A',
    domain: 'science',
    sceneGraph: {
      relation: 'chain',
      caption: '一环扣一环',
      nodes: [
        { id: 'n1', label: '青草', subject: '青草', role: 'object' },
        { id: 'n2', label: '兔子', subject: '兔子', role: 'subject' },
        { id: 'n3', label: '狐狸', subject: '狐狸', role: 'subject' },
      ],
    },
    graphIcons: {
      n2: 'assets/vector/animals/rabbit.svg',
      n3: 'assets/vector/animals/fox.svg',
    },
  },
  {
    id: 's3',
    title: '种子长大了',
    narration: '一颗小种子埋在土里，慢慢长出嫩芽，最后长成了一棵高高的大树。',
    onScreenText: '',
    visualDescription: 'plant growth',
    assetKey: 'topic',
    assetTags: [],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#2F9E44',
    domain: 'science',
    sceneGraph: {
      relation: 'growth',
      caption: '越长越高',
      nodes: [
        { id: 'n1', label: '幼苗', subject: '幼苗', role: 'object' },
        { id: 'n2', label: '小花', subject: '花朵', role: 'object' },
        { id: 'n3', label: '大树', subject: '大树', role: 'object' },
      ],
    },
    graphIcons: {
      n1: 'assets/vector/nature/seedling.svg',
      n2: 'assets/vector/nature/flower.svg',
      n3: 'assets/vector/nature/tree.svg',
    },
  },
  {
    id: 's4',
    title: '沉还是浮',
    narration: '把石头放进水里，它咕咚一下沉到底；把皮球放进水里，它却浮在水面上。',
    onScreenText: '',
    visualDescription: 'sink or float',
    assetKey: 'topic',
    assetTags: ['river'],
    action: 'idle',
    habitat: 'river',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#1C7ED6',
    domain: 'science',
    sceneGraph: {
      relation: 'compare',
      caption: '谁会浮起来？',
      nodes: [
        { id: 'n1', label: '石头', subject: '石头', role: 'object' },
        { id: 'n2', label: '皮球', subject: '皮球', role: 'object' },
      ],
    },
    graphIcons: {
      n2: 'assets/vector/objects/ball.svg',
    },
  },
  {
    id: 's5',
    title: '都是水果',
    narration: '苹果、香蕉和葡萄，它们都是水果。水果是植物结出来的果实，吃起来甜甜的。',
    onScreenText: '',
    visualDescription: 'fruit group',
    assetKey: 'topic',
    assetTags: [],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#E8590C',
    domain: 'science',
    sceneGraph: {
      relation: 'group',
      caption: '它们都是水果',
      nodes: [
        { id: 'n1', label: '水果', subject: '水果', role: 'abstract' },
        { id: 'n2', label: '苹果', subject: '苹果', role: 'object' },
        { id: 'n3', label: '香蕉', subject: '香蕉', role: 'object' },
        { id: 'n4', label: '葡萄', subject: '葡萄', role: 'object' },
      ],
    },
    graphIcons: {
      n2: 'assets/vector/food/apple.svg',
      n3: 'assets/vector/food/banana.svg',
      n4: 'assets/vector/food/grapes.svg',
    },
  },
  {
    id: 's6',
    title: '大树的样子',
    narration: '一棵大树由树干撑着，树枝上长满树叶，春天还会开出香香的花朵。',
    onScreenText: '',
    visualDescription: 'tree parts',
    assetKey: 'topic',
    assetTags: [],
    action: 'idle',
    habitat: 'forest',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#2B8A3E',
    domain: 'science',
    sceneGraph: {
      relation: 'split',
      caption: '大树由这些组成',
      nodes: [
        { id: 'n1', label: '大树', subject: '大树', role: 'object' },
        { id: 'n2', label: '树叶', subject: '树叶', role: 'object' },
        { id: 'n3', label: '花朵', subject: '花朵', role: 'object' },
        { id: 'n4', label: '树根', subject: '树根', role: 'object' },
      ],
    },
    graphIcons: {
      n1: 'assets/vector/nature/tree.svg',
      n2: 'assets/vector/nature/leaf.svg',
      n3: 'assets/vector/nature/flower.svg',
    },
  },
  // 没有关系图的场景：验证单主体 + 讲解高亮这条老路径没被改坏
  {
    id: 's7',
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
  // 看不到的东西怎么画：四个抽象节点各自走一种示意符号，验证没有退化成空白占位
  {
    id: 's8',
    title: '看不见的东西',
    narration: '数一数有几个，摸一摸有多热，风在流动，时间一直在往前走。',
    onScreenText: '',
    visualDescription: 'abstract signs',
    assetKey: 'topic',
    assetTags: [],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#7048E8',
    domain: 'science',
    sceneGraph: {
      relation: 'chain',
      caption: '看不见，但能画出来',
      nodes: [
        { id: 'n1', label: '个数', subject: '数量', role: 'abstract', sign: 'count' },
        { id: 'n2', label: '热量', subject: '温度', role: 'abstract', sign: 'level' },
        { id: 'n3', label: '风', subject: '风', role: 'abstract', sign: 'flow' },
        { id: 'n4', label: '时间', subject: '时间', role: 'abstract', sign: 'time' },
      ],
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
      defaultProps={{ title: "灵犀伴学", topic: "科学小课堂", scenes: SCENES, durationFrames: TOTAL }}
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
