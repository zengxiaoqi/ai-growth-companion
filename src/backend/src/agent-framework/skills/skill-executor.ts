import { Injectable } from "@nestjs/common";
import type { SkillDefinition } from "../core";

@Injectable()
export class SkillExecutor {
  /** Render a prompt template by replacing {{variable}} placeholders */
  renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  /** Validate that all required variables are provided */
  validateInputs(
    definition: SkillDefinition,
    variables: Record<string, unknown>,
  ): string | null {
    for (const variable of definition.variables) {
      if (
        variable.required &&
        variables[variable.name] === undefined &&
        variable.defaultValue === undefined
      ) {
        return `Missing required variable: ${variable.name}`;
      }
    }
    return null;
  }

  /** Apply default values for missing optional variables */
  applyDefaults(
    definition: SkillDefinition,
    variables: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...variables };
    for (const variable of definition.variables) {
      if (
        result[variable.name] === undefined &&
        variable.defaultValue !== undefined
      ) {
        result[variable.name] = variable.defaultValue;
      }
    }
    return result;
  }

  /**
   * Render the full skill content for system prompt injection.
   * Uses body (Markdown) with fallback to promptTemplate (legacy).
   * Appends all rules content.
   */
  renderSkillForPrompt(
    definition: SkillDefinition,
    variables?: Record<string, unknown>,
  ): string {
    const template = definition.body || definition.promptTemplate || "";
    const withDefaults = variables
      ? this.applyDefaults(definition, variables)
      : {};
    const renderedBody = template
      ? this.renderTemplate(template, withDefaults)
      : "";

    const parts: string[] = [];

    if (renderedBody) {
      parts.push(`## Skill: ${definition.name}\n\n${renderedBody}`);
    }

    if (definition.rules && definition.rules.length > 0) {
      for (const rule of definition.rules) {
        const renderedRule = this.renderTemplate(rule.content, withDefaults);
        parts.push(`### ${rule.name}\n\n${renderedRule}`);
      }
    }

    return parts.join("\n\n");
  }
}
