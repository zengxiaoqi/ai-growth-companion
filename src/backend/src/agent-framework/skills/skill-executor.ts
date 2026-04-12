import { Injectable, Logger } from '@nestjs/common';
import type { ISkill, SkillDefinition, SkillExecutionContext, ILlmClient, ExecutionResult } from '../core';

@Injectable()
export class SkillExecutor {
  private readonly logger = new Logger(SkillExecutor.name);

  constructor() {}

  /** Render a prompt template by replacing {{variable}} placeholders */
  renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  /** Validate that all required variables are provided */
  validateInputs(definition: SkillDefinition, variables: Record<string, unknown>): string | null {
    for (const variable of definition.variables) {
      if (variable.required && variables[variable.name] === undefined && variable.defaultValue === undefined) {
        return `Missing required variable: ${variable.name}`;
      }
    }
    return null;
  }

  /** Apply default values for missing optional variables */
  applyDefaults(definition: SkillDefinition, variables: Record<string, unknown>): Record<string, unknown> {
    const result = { ...variables };
    for (const variable of definition.variables) {
      if (result[variable.name] === undefined && variable.defaultValue !== undefined) {
        result[variable.name] = variable.defaultValue;
      }
    }
    return result;
  }
}
