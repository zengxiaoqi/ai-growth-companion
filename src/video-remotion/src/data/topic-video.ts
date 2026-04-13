export type AnimationTemplateId =
  | 'language.character-stroke'
  | 'language.word-reveal'
  | 'language.story-scene'
  | 'math.counting-objects'
  | 'math.shape-builder'
  | 'math.number-line'
  | 'math.abacus'
  | 'science.water-cycle'
  | 'science.day-night-cycle'
  | 'science.plant-growth'
  | 'science.seasons-cycle'
  | 'art.color-mixing'
  | 'art.drawing-steps'
  | 'social.emotion-faces'
  | 'social.daily-routine';

export type AnimationTemplateData = {
  id: AnimationTemplateId;
  params: Record<string, any>;
};

export type SlideLayout = "hero" | "grid" | "list";

export type SlideItem = {
  emoji: string;
  label: string;
};

export type SceneVisual = {
  /** Scene background type: day, night, indoor, spring, summer, autumn, winter */
  bgType?: string;
  /** Scene caption / on-screen text */
  caption?: string;
  /** Named characters in the scene (e.g. ["老师", "小朋友"]) */
  characters?: string[];
  /** Named items/objects in the scene (e.g. ["太阳", "花", "树叶"]) */
  items?: string[];
  /** Visual mood / atmosphere for rendering hints */
  mood?: 'playful' | 'calm' | 'exciting' | 'mysterious' | 'warm';
};

export type TeachingSlide = {
  title: string;
  emoji?: string;
  subtitle?: string;
  bgColor: string;
  accentColor: string;
  layout: SlideLayout;
  items?: SlideItem[];
  narration: string;
  narrationSrc?: string;
  durationFrames?: number;
  animationTemplate?: AnimationTemplateData;
  /** Rich visual scene description for SVG-based rendering */
  visual?: SceneVisual;
};

export type TeachingVideoData = {
  title: string;
  subtitle: string;
  introBg: string;
  outroBg: string;
  slides: TeachingSlide[];
};

export const DEFAULT_SLIDE_DURATION = 180; // 6s per slide @30fps
export const GENERIC_INTRO_DURATION = 90; // 3s
export const GENERIC_OUTRO_DURATION = 90; // 3s
export const GENERIC_TRANSITION_DURATION = 12; // 0.4s

export const DEFAULT_TOPIC_VIDEO: TeachingVideoData = {
  title: "认识动物",
  subtitle: "3-6岁启蒙课程",
  introBg: "#667EEA",
  outroBg: "#F093FB",
  slides: [
    {
      title: "小猫",
      emoji: "🐱",
      subtitle: "可爱的宠物",
      bgColor: "#FFF5F5",
      accentColor: "#FF6B6B",
      layout: "hero",
      items: [{ emoji: "🐾", label: "爪子" }, { emoji: "🐟", label: "爱吃鱼" }],
      narration: "这是小猫，小猫喜欢吃鱼",
      visual: { bgType: "day", caption: "小猫", characters: ["小猫", "老师"], items: ["鱼", "毛线球"], mood: "playful" },
      animationTemplate: { id: "language.story-scene", params: { bgType: "day", characters: ["小猫", "老师"], items: ["鱼"] } },
    },
    {
      title: "小狗",
      emoji: "🐶",
      subtitle: "忠诚的朋友",
      bgColor: "#FFFBEB",
      accentColor: "#FFD93D",
      layout: "hero",
      items: [{ emoji: "🦴", label: "爱啃骨头" }, { emoji: "🎾", label: "爱玩球" }],
      narration: "这是小狗，小狗汪汪叫",
      visual: { bgType: "day", caption: "小狗", characters: ["小狗", "老师"], items: ["骨头", "球"], mood: "playful" },
      animationTemplate: { id: "language.story-scene", params: { bgType: "day", characters: ["小狗", "老师"], items: ["骨头"] } },
    },
    {
      title: "小鸟",
      emoji: "🐦",
      subtitle: "天空的歌手",
      bgColor: "#EBF5FF",
      accentColor: "#4D96FF",
      layout: "hero",
      items: [{ emoji: "🌿", label: "住在树上" }, { emoji: "🐛", label: "爱吃虫子" }],
      narration: "这是小鸟，小鸟会唱歌",
      visual: { bgType: "day", caption: "小鸟", characters: ["小鸟", "老师"], items: ["树", "虫子"], mood: "calm" },
      animationTemplate: { id: "language.story-scene", params: { bgType: "day", characters: ["小鸟", "老师"], items: ["树"] } },
    },
    {
      title: "小鱼",
      emoji: "🐟",
      subtitle: "水中的精灵",
      bgColor: "#E8F8FF",
      accentColor: "#00B4D8",
      layout: "hero",
      items: [{ emoji: "🌊", label: "住在水里" }, { emoji: "💨", label: "游得很快" }],
      narration: "这是小鱼，小鱼住在水里",
      visual: { bgType: "day", caption: "小鱼", characters: ["小鱼", "老师"], items: ["水", "水草"], mood: "calm" },
      animationTemplate: { id: "science.water-cycle", params: { speed: 1, showLabels: true } },
    },
    {
      title: "蝴蝶",
      emoji: "🦋",
      subtitle: "花间的舞者",
      bgColor: "#F8F0FF",
      accentColor: "#9B59B6",
      layout: "hero",
      items: [{ emoji: "🌸", label: "喜欢花" }, { emoji: "🎨", label: "翅膀很美" }],
      narration: "这是蝴蝶，蝴蝶翅膀很美丽",
      visual: { bgType: "spring", caption: "蝴蝶", characters: ["蝴蝶", "老师"], items: ["花", "翅膀"], mood: "exciting" },
      animationTemplate: { id: "science.plant-growth", params: { plantType: "flower", stages: 4 } },
    },
  ],
};
