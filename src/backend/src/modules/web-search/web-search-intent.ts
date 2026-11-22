/**
 * Decides when a course generation request is worth a web lookup.
 *
 * Course generation is already slow, so the default is conservative: search
 * only when the request points at facts the model may not have (fresh news,
 * named works/people, natural-world detail) or when the parent wrote a real
 * request instead of just a topic name. Pure skill drills ("认识数字3",
 * "汉字:天") stay offline.
 */

import type { WebSearchMode } from './web-search.types';

const FRESH_CUES =
  /(最新|最近|今年|明年|去年|新闻|动态|研究|数据|统计|排名|榜单|推荐|2024|2025|2026|当下|现在)/;

const KNOWLEDGE_CUES =
  /(为什么|原理|百科|历史|由来|起源|节日|节气|传统|习俗|春节|中秋节|端午|元宵|重阳|清明|名人|名画|艺术家|绘本|儿歌|童谣|动物|植物|恐龙|宇宙|太空|海洋|人体|地球|天气|季节|彩虹|国家|城市|建筑|博物馆|发明|名著|童话|神话|交通规则|安全常识|职业|昆虫)/;

const PURE_SKILL =
  /(汉字|识字|认字|拼音|笔画|字母|数字|数数|加减|加法|减法|形状|图形|颜色|排序|大小|方位|时钟|认读)/;

export function normalizeWebSearchMode(
  value: unknown,
  fallback: WebSearchMode = 'auto',
): WebSearchMode {
  if (value === true) return 'on';
  if (value === false) return 'off';
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (text === 'on' || text === 'always' || text === 'true' || text === '1') return 'on';
  if (text === 'off' || text === 'never' || text === 'false' || text === '0') return 'off';
  if (text === 'auto' || text === '') return fallback;
  return fallback;
}

export function shouldSearchForCourse(input: {
  topic: string;
  parentPrompt?: string;
  domain?: string;
  mode?: WebSearchMode | boolean;
}): boolean {
  const topic = String(input.topic ?? '').trim();
  if (!topic) return false;

  const mode = normalizeWebSearchMode(input.mode, 'auto');
  if (mode === 'off') return false;
  if (mode === 'on') return true;

  const parentPrompt = String(input.parentPrompt ?? '').trim();
  const extra = parentPrompt && parentPrompt !== topic ? parentPrompt : '';
  const text = `${topic} ${extra}`;

  if (FRESH_CUES.test(text)) return true;
  if (KNOWLEDGE_CUES.test(text)) return true;
  if (PURE_SKILL.test(topic) && topic.length <= 16) return false;

  // A parent who wrote a full request usually wants concrete examples,
  // stories or local details, which is exactly what a lookup adds.
  if (extra.length >= 12 && extra.length >= topic.length) return true;

  if (['science', 'art', 'social'].includes(String(input.domain ?? '')) && extra.length >= 8) {
    return true;
  }

  return false;
}

export function buildCourseSearchQuery(input: {
  topic: string;
  domain?: string;
}): string {
  const topic = String(input.topic ?? '').trim();
  const suffixByDomain: Record<string, string> = {
    language: '儿童绘本 识字',
    math: '幼儿数学启蒙',
    science: '儿童科普',
    art: '儿童艺术启蒙',
    social: '幼儿社交 习惯培养',
  };
  const suffix = suffixByDomain[String(input.domain ?? '')] || '儿童启蒙';
  return `${topic} ${suffix}`.replace(/\s+/g, ' ').trim().slice(0, 80);
}
