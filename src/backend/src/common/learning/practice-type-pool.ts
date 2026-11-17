import type { ActivityType } from '../../agent-framework/core/types/tool-metadata';

/**
 * Practice-step type selection. The lesson practice step used to map each
 * focus to ONE fixed type (science → connection forever), so every science
 * lesson ended up as the same line-matching game. Pick from an age-appropriate
 * pool instead: 3-4 pools are icon-based (no reading required), 5-6 adds
 * text-based types. trace_path is excluded — the write step already traces.
 *
 * tap_target is "hear one short sentence → tap one picture", so it only works
 * when every target is a concrete, depictable noun (小猫 / 苹果 / 汽车). Social
 * and emotional topics are abstract behaviours (分享、轮流、交换、礼貌…): no
 * single emoji can express them to a 3-6 year old, which produces games a child
 * literally cannot play. Those domains are excluded from tap_target; the
 * remaining types (matching, sequencing, drag_sort …) carry abstract content
 * far better. See 2026-11 fix for assignment "分享玩具一起玩".
 */

const POOL_3_4: ActivityType[] = [
  'tap_target',
  'memory_flip',
  'drag_sort',
  'pattern_next',
  'puzzle',
];

const POOL_5_6: ActivityType[] = [
  'quiz',
  'true_false',
  'matching',
  'connection',
  'sequencing',
  'drag_sort',
  'memory_flip',
  'pattern_next',
  'tap_target',
  'puzzle',
];

export interface PracticeTypeContext {
  ageGroup: string;
  domain?: string;
}

export function practiceTypePool(ctx: PracticeTypeContext): ActivityType[] {
  const pool = ctx.ageGroup === '3-4' ? [...POOL_3_4] : [...POOL_5_6];
  const domain = ctx.domain;
  if (ctx.ageGroup !== '3-4' && domain === 'language') {
    pool.push('fill_blank');
  }
  if (domain === 'art') {
    pool.push('color_fill');
  }
  // Abstract social/emotional content cannot be expressed by a single emoji;
  // tap_target would generate an unplayable "tap the right picture" game.
  if (domain === 'social') {
    const index = pool.indexOf('tap_target');
    if (index >= 0) pool.splice(index, 1);
  }
  return pool;
}

export function pickPracticeActivityType(ctx: PracticeTypeContext): ActivityType {
  const pool = practiceTypePool(ctx);
  return pool[Math.floor(Math.random() * pool.length)];
}