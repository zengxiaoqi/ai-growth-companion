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

// 「彩虹」对照：这是最典型的一类知识——图形本身就是知识。
// 彩虹不是"几个概念之间的关系"，它是一道横跨天空的七色弧；用节点+标签永远画不出来。
// 下面两个场景模拟 LLM 面对"介绍彩虹"时最可能的两种输出，用来暴露当前模板的表达力上限。
const rainbowScenes = [
  {
    id: 'rb1',
    title: '彩虹是怎么来的',
    narration: '阳光照到空中的小水滴，光被折射和反射，就散成了七种颜色。',
    onScreenText: '阳光穿过水滴',
    visualDescription: 'rainbow formed by sunlight through raindrops',
    assetKey: 'topic',
    assetTags: ['rainbow', 'sun', 'water'],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#FF8A3D',
    domain: 'science',
    backgroundStyle: 'neutral',
    // 真实链路里「彩虹」会命中 vector-rainbow，这里手工补上，用来展示"最理想情况"——
    // 即便命中，彩虹也只是白框里的一个小图标，而不是一道横跨天空的弧。
    graphIcons: { n3: 'assets/vector/weather/rainbow.svg' },
    sceneGraph: {
      relation: 'chain',
      caption: '阳光变成彩虹',
      nodes: [
        { id: 'n1', label: '阳光', subject: '太阳', role: 'object' },
        { id: 'n2', label: '水滴', subject: '水滴', role: 'object' },
        { id: 'n3', label: '彩虹', subject: '彩虹', role: 'object' },
      ],
    },
  },
  {
    id: 'rb2',
    title: '彩虹有七种颜色',
    narration: '红橙黄绿蓝靛紫，一道彩虹里藏着七种颜色。',
    onScreenText: '彩虹',
    visualDescription: 'rainbow with seven colors',
    assetKey: 'topic',
    assetTags: ['rainbow'],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#FF8A3D',
    domain: 'science',
    backgroundStyle: 'neutral',
  },
  // rb3 是接通画板之后的同一主题：同一句需求，镜头里终于是一道弧。
  // 这份 spec 的合法性由 test/unit/figure-spec.spec.ts 兜住（等价用例）。
  {
    id: 'rb3',
    title: '彩虹是怎么来的',
    narration: '阳光照到空中的小水滴，被折射和反射，就散成了七种颜色。',
    onScreenText: '阳光穿过水滴',
    visualDescription: 'rainbow formed by sunlight through raindrops',
    assetKey: 'topic',
    assetTags: ['rainbow', 'sun', 'water'],
    action: 'idle',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#F76B15',
    domain: 'science',
    backgroundStyle: 'neutral',
    figure: {
      shapes: [
        { kind: 'circle', cx: 1420, cy: 150, r: 54, fill: '#FFC53D', reveal: 0.05 },
        { kind: 'circle', cx: 250, cy: 360, r: 11, fill: '#4DABF7', reveal: 0.12 },
        { kind: 'circle', cx: 300, cy: 445, r: 9, fill: '#4DABF7', reveal: 0.14 },
        { kind: 'circle', cx: 205, cy: 470, r: 10, fill: '#4DABF7', reveal: 0.16 },
        { kind: 'circle', cx: 330, cy: 292, r: 8, fill: '#4DABF7', reveal: 0.18 },
        { kind: 'arc', cx: 800, cy: 640, r: 490, from: 4, to: 176, stroke: '#E5484D', width: 34, reveal: 0.3 },
        { kind: 'arc', cx: 800, cy: 640, r: 450, from: 4, to: 176, stroke: '#F76B15', width: 34, reveal: 0.35 },
        { kind: 'arc', cx: 800, cy: 640, r: 410, from: 4, to: 176, stroke: '#FFC53D', width: 34, reveal: 0.4 },
        { kind: 'arc', cx: 800, cy: 640, r: 370, from: 4, to: 176, stroke: '#30A46C', width: 34, reveal: 0.45 },
        { kind: 'arc', cx: 800, cy: 640, r: 330, from: 4, to: 176, stroke: '#0091FF', width: 34, reveal: 0.5 },
        { kind: 'arc', cx: 800, cy: 640, r: 290, from: 4, to: 176, stroke: '#3E63DD', width: 34, reveal: 0.55 },
        { kind: 'arc', cx: 800, cy: 640, r: 250, from: 4, to: 176, stroke: '#8E4EC6', width: 34, reveal: 0.6 },
      ],
      labels: [
        { text: '阳光', x: 1420, y: 250 },
        { text: '水滴', x: 258, y: 540 },
      ],
    },
  },
];

// 三种环境背景各验一遍：草原、河岸、夜晚。森林（老虎）已在 s7。
// 以前植被不分栖息地，草原和河岸都长同一排树，这三帧就是用来盯这件事的。
const habitatScenes = [
  {
    id: 'h1',
    title: '草原上的兔子',
    narration: '小兔子竖起长耳朵，听一听四周有没有动静。',
    onScreenText: '兔子 · 长耳朵',
    visualDescription: 'rabbit in grassland',
    assetKey: 'rabbit',
    assetTags: ['rabbit'],
    action: 'listen',
    habitat: 'grassland',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#C0863C',
    domain: 'science',
    backgroundStyle: 'environment',
    visualAssets: {
      characterAssetSrc: 'assets/vector/animals/rabbit.svg',
      hasCharacterAsset: true,
      assetProvider: 'vector',
      license: 'mit',
      qualityScore: 92,
    },
  },
  {
    id: 'h2',
    title: '小鸭在河里',
    narration: '小鸭子在河面上游来游去，脚掌在水下划水。',
    onScreenText: '鸭子 · 会游泳',
    visualDescription: 'duck swimming in river',
    assetKey: 'duck',
    assetTags: ['duck', 'river'],
    action: 'swim',
    habitat: 'river',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#2F8FB8',
    domain: 'science',
    backgroundStyle: 'environment',
    visualAssets: {
      characterAssetSrc: 'assets/vector/animals/duck.svg',
      hasCharacterAsset: true,
      assetProvider: 'vector',
      license: 'mit',
      qualityScore: 92,
    },
  },
  {
    id: 'h3',
    title: '夜里的猫头鹰',
    narration: '天黑了，猫头鹰睁大眼睛，在树枝上看着我们。',
    onScreenText: '猫头鹰 · 夜里活动',
    visualDescription: 'owl at night',
    assetKey: 'owl',
    assetTags: ['owl'],
    action: 'idle',
    habitat: 'night',
    generatedVisual: 'svg',
    durationFrames: 200,
    accentColor: '#5F5AA2',
    domain: 'science',
    backgroundStyle: 'environment',
    visualAssets: {
      characterAssetSrc: 'assets/vector/animals/owl.svg',
      hasCharacterAsset: true,
      assetProvider: 'vector',
      license: 'mit',
      qualityScore: 92,
    },
  },
];
scenes.push(...habitatScenes, ...rainbowScenes);

// 与后端 resolveBackgroundStyle 保持同样的判定：有关系图（循环/对比/分类这类抽象结构）
// 就走中性底，否则按环境背景。以前不分青红皂白全铺森林，所有课程共用同一条样板街。
scenes.forEach((scene) => {
  if (!scene.backgroundStyle) scene.backgroundStyle = scene.sceneGraph ? 'neutral' : 'environment';
});

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
