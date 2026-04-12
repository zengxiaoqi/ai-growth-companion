/**
 * Skill interface — defines pluggable, reusable capability templates.
 *
 * Skills are higher-level than tools. They combine:
 * - A prompt template with variable placeholders
 * - A set of required tools
 * - Optional chaining to other skills
 *
 * Skills can be defined as JSON/YAML files and loaded at runtime,
 * enabling zero-code capability extensions.
 */

import type { AgeGroup } from '../types';
import type { ExecutionResult } from './agent.interface';

/** A variable expected by a skill's prompt template */
export interface SkillVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: unknown;
  description: string;
}

/** A supporting rule file within a skill directory */
export interface SkillRule {
  /** Rule file name (e.g. "audio.md") */
  name: string;
  /** Rule file content (Markdown) */
  content: string;
}

/** Static definition of a skill — can be loaded from Markdown or JSON */
export interface SkillDefinition {
  /** Unique skill identifier (derived from directory name for Markdown skills) */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this skill does */
  description: string;
  /** Keywords/patterns that trigger this skill */
  triggers: string[];
  /** @deprecated Use body for Markdown skills */
  promptTemplate?: string;
  /** Markdown body content (replaces promptTemplate) */
  body?: string;
  /** Variables expected by the template */
  variables: SkillVariable[];
  /** Tools this skill requires */
  requiredTools?: string[];
  /** Chain to another skill after completion */
  chainTo?: string;
  /** Age groups this skill applies to (empty = all) */
  ageGroups?: AgeGroup[];
  /** Supporting rule files from rules/ directory */
  rules?: SkillRule[];
}

/** Context available during skill execution */
export interface SkillExecutionContext {
  childId?: number;
  parentId?: number;
  ageGroup: AgeGroup | 'parent';
  conversationId: string;
}

/** The skill interface */
export interface ISkill {
  /** This skill's static definition */
  readonly definition: SkillDefinition;
  /**
   * Execute the skill with the provided variables and context.
   * Returns the LLM-generated result.
   */
  execute(
    variables: Record<string, unknown>,
    context: SkillExecutionContext,
  ): Promise<ExecutionResult>;
}
