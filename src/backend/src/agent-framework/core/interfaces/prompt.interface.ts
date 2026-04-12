/**
 * Prompt provider interface — abstracts prompt generation.
 *
 * Prompts are built from templates that vary by:
 * - Age group (3-4, 5-6)
 * - Role (child, parent)
 * - Available tools
 */

import type { AgeGroup } from '../types';

/** Context used to build a system prompt */
export interface PromptContext {
  childName?: string;
  parentName?: string;
  ageGroup: AgeGroup;
  role: 'child' | 'parent';
  availableTools: string[];
  /** Additional runtime context (childId, parentId, etc.) */
  runtimeContext?: Record<string, unknown>;
}

/** The prompt provider interface */
export interface IPromptProvider {
  /** Build a complete system prompt for the given context */
  getSystemPrompt(context: PromptContext): string;
  /** Register a custom prompt template for a specific age group and role */
  registerTemplate(ageGroup: AgeGroup, role: string, template: string): void;
  /** Build tool usage instructions for the given tool names */
  buildToolInstructions(tools: string[]): string;
}
