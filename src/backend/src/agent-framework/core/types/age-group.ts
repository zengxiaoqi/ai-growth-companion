/**
 * Age groups for the AI learning companion.
 *
 * The product originally shipped two preschool groups (3-4, 5-6). This
 * module is now the single source of truth for age → group mapping and
 * adds two school-age groups so a 9-year-old is no longer talked to like
 * a preschooler.
 *
 * Compatibility rule: the content library, curriculum directories, video
 * templates and animation tags still only know '3-4' and '5-6'. Rather
 * than spreading a second "which content bucket is this?" decision across
 * ~30 files, `contentAgeGroup()` is the one place that maps a real group
 * back to a legacy content bucket. New templates affect conversation
 * style; they never leave the content queries empty-handed.
 */

export type AgeGroup = '3-4' | '5-6' | '7-9' | '10-12';

/** The two buckets the existing content library understands. */
export type ContentAgeGroup = '3-4' | '5-6';

/** Extended age group including parent role */
export type AgeGroupOrParent = AgeGroup | 'parent';

export const ALL_AGE_GROUPS: readonly AgeGroup[] = ['3-4', '5-6', '7-9', '10-12'];
export const CONTENT_AGE_GROUPS: readonly ContentAgeGroup[] = ['3-4', '5-6'];

/** Groups that have their own conversation style beyond preschool. */
export const SCHOOL_AGE_GROUPS: readonly AgeGroup[] = ['7-9', '10-12'];

/**
 * Classify a numeric age into an AgeGroup.
 *
 * 3-4 and 5-6 keep their exact original behaviour. 7+ now gets a real
 * group instead of being silently treated as 5-6. Ages outside the
 * product's registration range are clamped to the nearest group rather
 * than falling into the middle bucket.
 */
export function classifyAge(age: number | undefined | null): AgeGroup {
  if (age == null || Number.isNaN(age)) return '5-6';
  if (age <= 4) return '3-4';
  if (age <= 6) return '5-6';
  if (age <= 9) return '7-9';
  return '10-12';
}

/**
 * Normalise an arbitrary value (tool argument, DB column, query param)
 * into a known group. Unknown values keep the historical default so a
 * malformed request cannot change behaviour.
 */
export function normalizeAgeGroup(value: unknown): AgeGroup {
  return typeof value === 'string' && (ALL_AGE_GROUPS as readonly string[]).includes(value)
    ? (value as AgeGroup)
    : '5-6';
}

/**
 * Map a real group onto the bucket the existing content layer can serve.
 *
 * Everything school-age uses the 5-6 bucket for now: the curriculum
 * directories, `contents.ageRange`, game data and animation tags are all
 * keyed by those two strings. Adding a bucket here requires new content,
 * not just a new label.
 */
export function contentAgeGroup(group: AgeGroupOrParent | string): ContentAgeGroup {
  return group === '3-4' ? '3-4' : '5-6';
}

/** Suggested activity difficulty for a group (1 = preschool, 5 = upper primary). */
export function difficultyForAge(group: AgeGroupOrParent | string): number {
  if (group === '3-4') return 1;
  if (group === '5-6') return 2;
  if (group === '7-9') return 3;
  if (group === '10-12') return 4;
  return 2;
}

/** Human-readable label for an age group */
export function ageGroupLabel(group: AgeGroupOrParent | string): string {
  switch (group) {
    case '3-4':
      return '3-4岁';
    case '5-6':
      return '5-6岁';
    case '7-9':
      return '7-9岁';
    case '10-12':
      return '10-12岁';
    case 'parent':
      return '家长';
    default:
      return '5-6岁';
  }
}
