import { Slide, Theme } from './bento-document.interface';

export interface BentoSlideTemplate<T> {
  toSlides(data: T, theme: Theme): Slide[];
  defaultTheme(): Theme;
}

export interface ReportData {
  childName: string;
  period: string;
  startDate: string;
  endDate: string;
  totalLearningTime: number; // seconds
  totalLessonsCompleted: number;
  averageScore: number;
  dailyStats: Array<{
    date: string;
    totalTime: number;
    completedLessons: number;
    averageScore: number;
  }>;
  skillProgress: Record<string, number>; // {language: 80, math: 65, ...}
  achievements: Array<{ name: string; description: string; earnedAt: string }>;
  insights: string[];
  streak: number;
  encouragement: string;
}

/** 月报数据 —— 包含周次分解 */
export interface MonthlyReportData extends ReportData {
  weekSummaries: Array<{
    weekLabel: string;
    totalTime: number;
    completedLessons: number;
    averageScore: number;
  }>;
  /** 过去 4 周各科分数趋势 */
  trendHistory: Array<{
    label: string; // 第1周, 第2周, ...
    language: number;
    math: number;
    science: number;
    art: number;
    social: number;
  }>;
  monthlyHighlight: string;
}

/** 诗词鉴赏数据 */
export interface PoetryData {
  poemId: number;
  title: string;
  author: string;
  dynasty: string;
  type: string;
  /** 诗句数组，每行一句 */
  lines: string[];
  translation: string;
  notes: Array<{ term: string; explanation: string }>;
  appreciation: string;
  /** 背景故事（可选，由 AI 生成） */
  background?: string;
}

/** 课程内容幻灯片数据 */
export interface ContentSlideData {
  title: string;
  subtitle?: string;
  ageRange: string;
  domain: string;
  sections: Array<{
    type: 'text' | 'image' | 'game' | 'quiz';
    content: string;
    imageUrl?: string;
  }>;
  /** 课程总结 */
  summary?: string;
}

/** 成就展示数据 */
export interface AchievementData {
  childName: string;
  achievements: Array<{
    id: number;
    name: string;
    description: string;
    category: string; // learning, social, creative, ...
    tier: string; // bronze, silver, gold, platinum, diamond
    unlocked: boolean;
    unlockedAt?: string; // ISO date string
    progress: number;
    totalRequired: number;
  }>;
}
