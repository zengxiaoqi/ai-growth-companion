import type { TeachingVideoData } from "./topic-video";

export const CHINESE_CHARACTERS_VIDEO: TeachingVideoData = {
  title: "认识汉字",
  subtitle: "3-6岁启蒙课程",
  introBg: "#4A90D9",
  outroBg: "#F5A623",
  slides: [
    {
      title: "水",
      emoji: "💧",
      subtitle: "水是生命之源",
      bgColor: "#E8F4FD",
      accentColor: "#2E86DE",
      layout: "hero",
      items: [
        { emoji: "🌊", label: "大海" },
        { emoji: "🌧️", label: "雨水" },
        { emoji: "💧", label: "水滴" },
      ],
      narration: "这是水，水的笔画有四画。水是生命之源，我们每天都要喝水。你看，水滴、雨水、大海，都是水。",
      narrationSrc: "narration-water.mp3",
      durationFrames: 210, // 7s — matches narration length
      animationTemplate: {
        id: "language.character-stroke",
        params: {
          character: "水",
          strokeColor: "#2E86DE",
          showGrid: true,
        },
      },
    },
    {
      title: "火",
      emoji: "🔥",
      subtitle: "火能发光发热",
      bgColor: "#FFF0E6",
      accentColor: "#E74C3C",
      layout: "hero",
      items: [
        { emoji: "🔥", label: "火焰" },
        { emoji: "🕯️", label: "蜡烛" },
        { emoji: "🔥", label: "篝火" },
      ],
      narration: "这是火，火的笔画有四画。火能发光发热，但要注意安全哦。蜡烛的火焰、温暖的篝火，都是火。",
      narrationSrc: "narration-fire.mp3",
      durationFrames: 210,
      animationTemplate: {
        id: "language.character-stroke",
        params: {
          character: "火",
          strokeColor: "#E74C3C",
          showGrid: true,
        },
      },
    },
    {
      title: "土",
      emoji: "🌍",
      subtitle: "土地孕育万物",
      bgColor: "#FFF8E1",
      accentColor: "#8B6914",
      layout: "hero",
      items: [
        { emoji: "🌱", label: "植物" },
        { emoji: "🏔️", label: "高山" },
        { emoji: "🌾", label: "田地" },
      ],
      narration: "这是土，土的笔画有三画。土地孕育万物，花草树木都长在土里。植物、高山、田地，都离不开土。",
      narrationSrc: "narration-earth.mp3",
      durationFrames: 210,
      animationTemplate: {
        id: "language.character-stroke",
        params: {
          character: "土",
          strokeColor: "#8B6914",
          showGrid: true,
        },
      },
    },
  ],
};
