export type SlideLayout = "hero" | "grid" | "list";

export type SlideItem = {
  emoji: string;
  label: string;
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
    },
  ],
};
