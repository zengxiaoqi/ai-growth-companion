/**
 * Age-adaptive prompt selector.
 *
 * Maps (ageGroup, role, name) to the correct prompt template function.
 * This is the single entry point for selecting which prompt to use
 * without coupling callers to individual template files.
 */

import type { AgeGroup } from '../core';
import { child34SystemPrompt } from './templates/child-3-4.system';
import { child56SystemPrompt } from './templates/child-5-6.system';
import { childSchoolAgeSystemPrompt } from './templates/child-school-age.system';
import { parentSystemPrompt } from './templates/parent.system';

/**
 * Select and render the appropriate system prompt.
 *
 * @param ageGroup - The child's age group. Ignored when role is 'parent'.
 * @param role     - 'child' or 'parent'.
 * @param name     - The child's name (for child role) or parent's name (for parent role).
 * @returns The fully rendered system prompt string.
 */
export function selectPrompt(ageGroup: AgeGroup, role: 'child' | 'parent', name: string): string {
  if (role === 'parent') {
    return parentSystemPrompt(name);
  }

  if (ageGroup === '3-4') {
    return child34SystemPrompt(name);
  }

  if (ageGroup === '7-9' || ageGroup === '10-12') {
    return childSchoolAgeSystemPrompt(name, ageGroup);
  }

  // '5-6' and any unrecognised value keep the historical default.
  return child56SystemPrompt(name);
}
