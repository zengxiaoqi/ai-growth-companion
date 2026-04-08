export type NumberData = {
  digit: string;
  chinese: string;
  emoji: string;
  label: string;
  color: string;
  bgColor: string;
};

export const NUMBERS: NumberData[] = [
  { digit: "1", chinese: "一", emoji: "🍎", label: "苹果", color: "#FF6B6B", bgColor: "#FFF5F5" },
  { digit: "2", chinese: "二", emoji: "🍌", label: "香蕉", color: "#FFD93D", bgColor: "#FFFBEB" },
  { digit: "3", chinese: "三", emoji: "🐱", label: "小猫", color: "#FF9A76", bgColor: "#FFF0E8" },
  { digit: "4", chinese: "四", emoji: "🐶", label: "小狗", color: "#6BCB77", bgColor: "#F0FFF4" },
  { digit: "5", chinese: "五", emoji: "⭐", label: "星星", color: "#4D96FF", bgColor: "#EBF5FF" },
  { digit: "6", chinese: "六", emoji: "🌸", label: "花朵", color: "#FF6B9D", bgColor: "#FFF0F6" },
  { digit: "7", chinese: "七", emoji: "🦋", label: "蝴蝶", color: "#9B59B6", bgColor: "#F8F0FF" },
  { digit: "8", chinese: "八", emoji: "🐟", label: "小鱼", color: "#00B4D8", bgColor: "#E8F8FF" },
  { digit: "9", chinese: "九", emoji: "🐦", label: "小鸟", color: "#E67E22", bgColor: "#FFF8F0" },
  { digit: "10", chinese: "十", emoji: "🎈", label: "气球", color: "#E74C3C", bgColor: "#FFF0F0" },
];
