// 使用系统自带中文字体，避免渲染时拉取在线字体（离线/受限网络会挂起无头浏览器）
export const FONT_FAMILY =
  '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", sans-serif';

export const FONT_SIZES = {
  heroNumber: 260,
  chineseChar: 72,
  label: 36,
  countingText: 44,
  title: 64,
  subtitle: 42,
} as const;

/**
 * Narration text for each number.
 * To generate audio: use backend's VoiceService.textToSpeech()
 * and save to public/narration-{digit}.mp3
 */
export const NARRATIONS: Record<string, string> = {
  "1": "这是一，一个苹果",
  "2": "这是二，两个香蕉",
  "3": "这是三，三只小猫",
  "4": "这是四，四只小狗",
  "5": "这是五，五颗星星",
  "6": "这是六，六朵花",
  "7": "这是七，七只蝴蝶",
  "8": "这是八，八条小鱼",
  "9": "这是九，九只小鸟",
  "10": "这是十，十个气球",
};
