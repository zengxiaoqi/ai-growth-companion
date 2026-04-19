/**
 * Prompt provider service — NestJS injectable that implements IPromptProvider.
 *
 * Builds complete system prompts by combining:
 * 1. A base template selected by age-group / role (via selectPrompt)
 * 2. Optional runtime context hints (childId, parentId, session info)
 * 3. Tool usage instructions derived from the currently available tools
 *
 * Custom templates can be registered at module-initialisation time via
 * `registerTemplate()`, allowing feature modules to override or extend
 * the built-in prompts without modifying template files directly.
 */

import { Injectable } from "@nestjs/common";
import type { AgeGroup, PromptContext, IPromptProvider } from "../core";
import { selectPrompt } from "./age-adaptive";

/** Key used to store registered templates in the internal map. */
type TemplateKey = `${AgeGroup | "parent"}:${string}`;

@Injectable()
export class PromptProviderService implements IPromptProvider {
  /** Custom templates registered at runtime, keyed by "ageGroup:role". */
  private readonly customTemplates = new Map<TemplateKey, string>();

  // ------------------------------------------------------------------
  // IPromptProvider implementation
  // ------------------------------------------------------------------

  /**
   * Build a complete system prompt for the given context.
   *
   * The prompt consists of:
   * - The base system prompt (custom template if registered, otherwise the
   *   built-in age-adaptive template)
   * - A runtime context section (if any runtimeContext values are provided)
   * - Tool usage instructions
   */
  getSystemPrompt(context: PromptContext): string {
    const basePrompt = this.resolveBasePrompt(context);
    const runtimeSection = this.buildRuntimeSection(context.runtimeContext);
    const toolSection = this.buildToolInstructions(context.availableTools);

    const sections = [basePrompt];

    if (runtimeSection.length > 0) {
      sections.push(runtimeSection);
    }

    if (toolSection.length > 0) {
      sections.push(toolSection);
    }

    return sections.join("\n\n");
  }

  /**
   * Register a custom prompt template that overrides the built-in template
   * for the given ageGroup and role combination.
   *
   * The template string is used verbatim — it is NOT a function, so it
   * cannot embed the user's name dynamically. Use placeholder conventions
   * (e.g. {{name}}) if you need dynamic substitution and handle it in a
   * subclass or wrapper.
   */
  registerTemplate(ageGroup: AgeGroup, role: string, template: string): void {
    const key: TemplateKey = `${ageGroup}:${role}`;
    this.customTemplates.set(key, template);
  }

  /**
   * Build tool usage instructions from the list of available tool names.
   *
   * This generates a compact section appended to the system prompt that
   * lists the tools the agent may call during the current session.
   */
  buildToolInstructions(tools: string[]): string {
    if (tools.length === 0) {
      return "";
    }

    const toolList = tools.map((t) => `- ${t}`).join("\n");
    return `## 当前可用工具\n${toolList}`;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /** Look up a custom template first, then fall back to selectPrompt. */
  private resolveBasePrompt(context: PromptContext): string {
    const key: TemplateKey = `${context.ageGroup}:${context.role}`;
    const custom = this.customTemplates.get(key);

    if (custom) {
      return custom;
    }

    const name =
      context.role === "parent"
        ? (context.parentName ?? "家长")
        : (context.childName ?? "小朋友");

    return selectPrompt(context.ageGroup, context.role, name);
  }

  /**
   * Convert the runtimeContext record into a prompt section.
   * Empty / undefined values are omitted.
   */
  private buildRuntimeSection(
    runtimeContext?: Record<string, unknown>,
  ): string {
    if (!runtimeContext || Object.keys(runtimeContext).length === 0) {
      return "";
    }

    const lines = Object.entries(runtimeContext)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `- ${key}: ${String(value)}`);

    if (lines.length === 0) {
      return "";
    }

    return `## 运行时上下文\n${lines.join("\n")}`;
  }
}
