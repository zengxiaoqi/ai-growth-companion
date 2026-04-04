import type { Ability } from '@/types';

export const DOMAIN_CONFIG: Record<string, { label: string; color: string; containerColor: string; textColor: string; chartColor: string }> = {
  language: {
    label: '语言',
    color: 'bg-secondary',
    containerColor: 'bg-secondary-container/30',
    textColor: 'text-on-secondary-container',
    chartColor: '#006384',
  },
  math: {
    label: '数学',
    color: 'bg-tertiary',
    containerColor: 'bg-tertiary-container/30',
    textColor: 'text-on-tertiary-container',
    chartColor: '#586000',
  },
  science: {
    label: '科学',
    color: 'bg-primary',
    containerColor: 'bg-primary-container/30',
    textColor: 'text-on-primary-container',
    chartColor: '#705900',
  },
  art: {
    label: '艺术',
    color: 'bg-surface-container-high',
    containerColor: 'bg-surface-container/50',
    textColor: 'text-on-surface',
    chartColor: '#b9ae6e',
  },
  social: {
    label: '社会',
    color: 'bg-error',
    containerColor: 'bg-error-container/30',
    textColor: 'text-error',
    chartColor: '#b02500',
  },
};

export const ALL_DOMAINS = ['language', 'math', 'science', 'art', 'social'];

export const ACTIVITY_TYPES = [
  { value: 'quiz', label: '选择题' },
  { value: 'true_false', label: '判断题' },
  { value: 'fill_blank', label: '填空题' },
  { value: 'matching', label: '配对游戏' },
  { value: 'connection', label: '连线游戏' },
  { value: 'sequencing', label: '排序游戏' },
  { value: 'puzzle', label: '拼图游戏' },
];

export const defaultChartData: { name: string; time: number }[] = [];

export const fallbackAbilities: Ability[] = ALL_DOMAINS.map((domain, index) => ({
  id: index,
  userId: 0,
  domain,
  level: 0,
  progress: 0,
  updatedAt: new Date().toISOString(),
}));

export const fallbackTrendData: { week: string; language: number; math: number; science: number; art: number; social: number }[] = [];

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}
