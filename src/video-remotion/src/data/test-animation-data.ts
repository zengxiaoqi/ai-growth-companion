import type { TeachingVideoData } from "./topic-video";

export const MATH_TEST_VIDEO: TeachingVideoData = {
  title: "趣味数学",
  subtitle: "数学启蒙动画课",
  introBg: "#667EEA",
  outroBg: "#F093FB",
  slides: [
    {
      title: "数一数",
      bgColor: "#FFFBEB",
      accentColor: "#FFD93D",
      layout: "hero",
      narration: "我们一起来数一数，有几个苹果呢？",
      durationFrames: 300,
      animationTemplate: {
        id: "math.counting-objects",
        params: { targetCount: 5, objectType: "apple" },
      },
    },
    {
      title: "认识图形",
      bgColor: "#EBF5FF",
      accentColor: "#4D96FF",
      layout: "hero",
      narration: "我们一起来认识这些有趣的图形吧！",
      durationFrames: 300,
      animationTemplate: {
        id: "math.shape-builder",
        params: { shapes: ["circle", "triangle", "square"] },
      },
    },
    {
      title: "数字线",
      bgColor: "#FFF5F5",
      accentColor: "#FF6B6B",
      layout: "hero",
      narration: "小青蛙在数字线上跳一跳！",
      durationFrames: 300,
      animationTemplate: {
        id: "math.number-line",
        params: { startNum: 0, endNum: 10, highlightNum: 5 },
      },
    },
    {
      title: "算盘计数",
      bgColor: "#F8F0FF",
      accentColor: "#9B59B6",
      layout: "hero",
      narration: "我们用算盘来数数吧！",
      durationFrames: 300,
      animationTemplate: {
        id: "math.abacus",
        params: { rows: 2, values: [3, 5] },
      },
    },
  ],
};

export const LANGUAGE_TEST_VIDEO: TeachingVideoData = {
  title: "汉字启蒙",
  subtitle: "语言启蒙动画课",
  introBg: "#FF6B6B",
  outroBg: "#FFD93D",
  slides: [
    {
      title: "学写\"大\"字",
      bgColor: "#FFF8F0",
      accentColor: "#E67E22",
      layout: "hero",
      narration: "我们一起来学写\"大\"字吧！",
      durationFrames: 300,
      animationTemplate: {
        id: "language.character-stroke",
        params: { character: "大", showGrid: true },
      },
    },
    {
      title: "认识词语",
      bgColor: "#F8F0FF",
      accentColor: "#9B59B6",
      layout: "hero",
      narration: "看看这些词语是怎么出现的！",
      durationFrames: 300,
      animationTemplate: {
        id: "language.word-reveal",
        params: { words: ["太阳", "月亮", "星星", "白云"] },
      },
    },
    {
      title: "故事时间",
      bgColor: "#FFF5F5",
      accentColor: "#FF6B6B",
      layout: "hero",
      narration: "听老师讲一个有趣的故事。",
      durationFrames: 300,
      animationTemplate: {
        id: "language.story-scene",
        params: { bgType: "day", characters: ["小猫", "小狗"], items: ["花", "树"] },
      },
    },
  ],
};

export const SCIENCE_TEST_VIDEO: TeachingVideoData = {
  title: "探索科学",
  subtitle: "科学启蒙动画课",
  introBg: "#00B4D8",
  outroBg: "#6BCB77",
  slides: [
    {
      title: "四季变化",
      bgColor: "#F0FFF4",
      accentColor: "#6BCB77",
      layout: "hero",
      narration: "春夏秋冬，四季轮转。",
      durationFrames: 480,
      animationTemplate: {
        id: "science.seasons-cycle",
        params: { seasonNames: ["春", "夏", "秋", "冬"] },
      },
    },
    {
      title: "水循环",
      bgColor: "#E8F8FF",
      accentColor: "#00B4D8",
      layout: "hero",
      narration: "水是从哪里来的呢？",
      durationFrames: 360,
      animationTemplate: {
        id: "science.water-cycle",
        params: { speed: 1, showLabels: true },
      },
    },
    {
      title: "植物生长",
      bgColor: "#F0FFF4",
      accentColor: "#6BCB77",
      layout: "hero",
      narration: "种子是怎样变成花朵的呢？",
      durationFrames: 360,
      animationTemplate: {
        id: "science.plant-growth",
        params: { plantType: "flower", stages: 4 },
      },
    },
    {
      title: "白天和夜晚",
      bgColor: "#E8F4FF",
      accentColor: "#4D96FF",
      layout: "hero",
      narration: "白天和夜晚是怎么交替的呢？",
      durationFrames: 480,
      animationTemplate: {
        id: "science.day-night-cycle",
        params: { rotationSpeed: 1, showLabels: true },
      },
    },
  ],
};

export const ART_SOCIAL_TEST_VIDEO: TeachingVideoData = {
  title: "艺术与生活",
  subtitle: "综合启蒙动画课",
  introBg: "#FF6B9D",
  outroBg: "#FFD93D",
  slides: [
    {
      title: "颜色混合",
      bgColor: "#FFF0F6",
      accentColor: "#FF6B9D",
      layout: "hero",
      narration: "两种颜色混在一起会变成什么呢？",
      durationFrames: 300,
      animationTemplate: {
        id: "art.color-mixing",
        params: { color1: "#FF0000", color2: "#0000FF", resultLabel: "紫色" },
      },
    },
    {
      title: "分步画画",
      bgColor: "#FFFBEB",
      accentColor: "#FFD93D",
      layout: "hero",
      narration: "我们一步一步来画一幅画吧！",
      durationFrames: 300,
      animationTemplate: {
        id: "art.drawing-steps",
        params: { steps: ["画圆", "加眼睛", "加嘴巴", "画完成"] },
      },
    },
    {
      title: "认识情绪",
      bgColor: "#FFF5F5",
      accentColor: "#FF6B6B",
      layout: "hero",
      narration: "你能分辨这些表情吗？",
      durationFrames: 360,
      animationTemplate: {
        id: "social.emotion-faces",
        params: { emotions: ["happy", "sad", "angry", "surprised"] },
      },
    },
    {
      title: "一天的生活",
      bgColor: "#EBF5FF",
      accentColor: "#4D96FF",
      layout: "hero",
      narration: "小朋友一天都做些什么呢？",
      durationFrames: 300,
      animationTemplate: {
        id: "social.daily-routine",
        params: { activities: ["起床", "吃饭", "学习", "玩耍", "睡觉"] },
      },
    },
  ],
};

export const ALL_TEMPLATES_TEST_VIDEO: TeachingVideoData = {
  title: "全能动画课",
  subtitle: "15种教学动画展示",
  introBg: "#667EEA",
  outroBg: "#F093FB",
  slides: [
    {
      title: "数一数",
      bgColor: "#FFFBEB", accentColor: "#FFD93D", layout: "hero",
      narration: "一起来数数！",
      durationFrames: 240,
      animationTemplate: { id: "math.counting-objects", params: { targetCount: 3, objectType: "star" } },
    },
    {
      title: "认识图形",
      bgColor: "#EBF5FF", accentColor: "#4D96FF", layout: "hero",
      narration: "认识有趣的图形！",
      durationFrames: 240,
      animationTemplate: { id: "math.shape-builder", params: { shapes: ["circle", "square"] } },
    },
    {
      title: "数字线",
      bgColor: "#FFF5F5", accentColor: "#FF6B6B", layout: "hero",
      narration: "数字线跳一跳！",
      durationFrames: 240,
      animationTemplate: { id: "math.number-line", params: { startNum: 1, endNum: 5 } },
    },
    {
      title: "算盘",
      bgColor: "#F8F0FF", accentColor: "#9B59B6", layout: "hero",
      narration: "算盘拨一拨！",
      durationFrames: 240,
      animationTemplate: { id: "math.abacus", params: { rows: 2, values: [4, 3] } },
    },
    {
      title: "写汉字",
      bgColor: "#FFF8F0", accentColor: "#E67E22", layout: "hero",
      narration: "一起来写字！",
      durationFrames: 240,
      animationTemplate: { id: "language.character-stroke", params: { character: "人" } },
    },
    {
      title: "学词语",
      bgColor: "#F8F0FF", accentColor: "#9B59B6", layout: "hero",
      narration: "看词语出现了！",
      durationFrames: 240,
      animationTemplate: { id: "language.word-reveal", params: { words: ["苹果", "香蕉"] } },
    },
    {
      title: "四季",
      bgColor: "#F0FFF4", accentColor: "#6BCB77", layout: "hero",
      narration: "春夏秋冬！",
      durationFrames: 360,
      animationTemplate: { id: "science.seasons-cycle", params: {} },
    },
    {
      title: "水循环",
      bgColor: "#E8F8FF", accentColor: "#00B4D8", layout: "hero",
      narration: "水循环！",
      durationFrames: 300,
      animationTemplate: { id: "science.water-cycle", params: {} },
    },
    {
      title: "植物",
      bgColor: "#F0FFF4", accentColor: "#6BCB77", layout: "hero",
      narration: "种子长大了！",
      durationFrames: 240,
      animationTemplate: { id: "science.plant-growth", params: {} },
    },
    {
      title: "昼夜",
      bgColor: "#E8F4FF", accentColor: "#4D96FF", layout: "hero",
      narration: "白天和黑夜！",
      durationFrames: 300,
      animationTemplate: { id: "science.day-night-cycle", params: {} },
    },
    {
      title: "颜色",
      bgColor: "#FFF0F6", accentColor: "#FF6B9D", layout: "hero",
      narration: "颜色混合！",
      durationFrames: 240,
      animationTemplate: { id: "art.color-mixing", params: { color1: "#FF0000", color2: "#FFFF00" } },
    },
    {
      title: "画画",
      bgColor: "#FFFBEB", accentColor: "#FFD93D", layout: "hero",
      narration: "一起来画画！",
      durationFrames: 240,
      animationTemplate: { id: "art.drawing-steps", params: {} },
    },
    {
      title: "表情",
      bgColor: "#FFF5F5", accentColor: "#FF6B6B", layout: "hero",
      narration: "认识表情！",
      durationFrames: 300,
      animationTemplate: { id: "social.emotion-faces", params: {} },
    },
    {
      title: "作息",
      bgColor: "#EBF5FF", accentColor: "#4D96FF", layout: "hero",
      narration: "一天的作息！",
      durationFrames: 240,
      animationTemplate: { id: "social.daily-routine", params: {} },
    },
  ],
};
