/**
 * Age group types for the AI learning companion.
 * Children are segmented into two developmental groups: 3-4 years and 5-6 years.
 * Content, prompts, and activity difficulty adapt per group.
 */

export type AgeGroup = "3-4" | "5-6";

/** Extended age group including parent role */
export type AgeGroupOrParent = AgeGroup | "parent";

/** Classify a numeric age into an AgeGroup */
export function classifyAge(age: number | undefined | null): AgeGroup {
  if (age == null) return "5-6";
  if (age >= 3 && age <= 4) return "3-4";
  if (age >= 5 && age <= 6) return "5-6";
  return "5-6";
}

/** Human-readable label for an age group */
export function ageGroupLabel(group: AgeGroup): string {
  return group === "3-4" ? "3-4岁" : "5-6岁";
}
