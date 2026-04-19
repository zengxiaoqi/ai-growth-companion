/**
 * AgentRegistryService — implements IAgentRegistry with keyword-based routing.
 *
 * Manages agent definitions and their factory functions.
 * Provides agent selection via simple keyword matching on input text and context.
 */

import { Injectable, Logger } from "@nestjs/common";
import type { IAgent, AgentDefinition, AgentContext } from "../core";
import type { IAgentRegistry } from "../core";

interface RegisteredAgent {
  definition: AgentDefinition;
  factory: () => IAgent;
  /** Keywords that trigger this agent */
  keywords: string[];
}

@Injectable()
export class AgentRegistryService implements IAgentRegistry {
  private readonly logger = new Logger(AgentRegistryService.name);
  private readonly agents: Map<string, RegisteredAgent> = new Map();

  /** Register an agent definition with its factory function */
  register(definition: AgentDefinition, factory: () => IAgent): void {
    if (this.agents.has(definition.type)) {
      this.logger.warn(
        `Agent "${definition.type}" already registered — overwriting`,
      );
    }

    // Extract routing keywords from the definition description and type
    const keywords = this.extractKeywords(definition);

    this.agents.set(definition.type, { definition, factory, keywords });
    this.logger.log(
      `Registered agent: ${definition.type} (${definition.name})`,
    );
  }

  /** Look up an agent by type identifier */
  get(type: string): IAgent | undefined {
    const entry = this.agents.get(type);
    return entry ? entry.factory() : undefined;
  }

  /** Get all registered agents with their definitions */
  getAll(): Array<{ definition: AgentDefinition; agent: IAgent }> {
    return Array.from(this.agents.values()).map((entry) => ({
      definition: entry.definition,
      agent: entry.factory(),
    }));
  }

  /**
   * Select the best agent for a given input and context.
   *
   * Routing strategy:
   * 1. If context.ageGroup === 'parent', select parent-advisor
   * 2. Otherwise, match input keywords against agent definitions
   * 3. Fall back to child-companion as the default
   */
  select(input: string, context: AgentContext): IAgent {
    // Direct routing by age group
    if (context.ageGroup === "parent") {
      const parentAgent = this.get("parent-advisor");
      if (parentAgent) return parentAgent;
    }

    // Keyword-based routing
    const lowerInput = input.toLowerCase();
    let bestMatch: RegisteredAgent | undefined;
    let bestScore = 0;

    for (const entry of this.agents.values()) {
      const score = this.computeMatchScore(lowerInput, entry);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    // Return best match if it scored above threshold
    if (bestMatch && bestScore > 0) {
      this.logger.log(
        `Selected agent: ${bestMatch.definition.type} (score=${bestScore})`,
      );
      return bestMatch.factory();
    }

    // Default: return child-companion if available, otherwise first registered agent
    const defaultAgent = this.get("child-companion");
    if (defaultAgent) return defaultAgent;

    const firstEntry = this.agents.values().next().value;
    if (firstEntry) {
      this.logger.warn(
        "No matching agent found, falling back to first registered agent",
      );
      return firstEntry.factory();
    }

    throw new Error("No agents registered in the agent registry");
  }

  // --- Private helpers ---

  private extractKeywords(definition: AgentDefinition): string[] {
    const words: string[] = [];
    // Type-based keywords
    words.push(definition.type.replace(/-/g, " "));
    // Description words (simple tokenization)
    const descWords = definition.description
      .toLowerCase()
      .split(/[\s,，。.、]+/)
      .filter((w) => w.length > 1);
    words.push(...descWords);
    return words;
  }

  private computeMatchScore(input: string, entry: RegisteredAgent): number {
    let score = 0;
    const { definition, keywords } = entry;

    // Match keywords in input
    for (const keyword of keywords) {
      if (input.includes(keyword)) {
        score += 1;
      }
    }

    // Boost for course-designer when input mentions course pack generation
    if (definition.type === "course-designer") {
      const courseKeywords = ["课程包", "课程", "生成课程", "course", "pack"];
      for (const kw of courseKeywords) {
        if (input.includes(kw)) score += 2;
      }
    }

    // Boost for activity-generator when input mentions activity/quiz generation
    if (definition.type === "activity-generator") {
      const activityKeywords = [
        "活动",
        "生成活动",
        "游戏",
        "activity",
        "generate",
      ];
      for (const kw of activityKeywords) {
        if (input.includes(kw)) score += 2;
      }
    }

    return score;
  }
}
