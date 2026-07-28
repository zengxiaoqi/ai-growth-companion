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
