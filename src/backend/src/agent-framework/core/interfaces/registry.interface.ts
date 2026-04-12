/**
 * Registry interfaces for tools, agents, and skills.
 *
 * Registries provide lookup, enumeration, and execution capabilities.
 * They are the single source of truth for what's available at runtime.
 */

import type { ITool } from './tool.interface';
import type { IAgent } from './agent.interface';
import type { ISkill } from './skill.interface';
import type { ToolResult, ToolExecutionContext } from '../types';

// --- Tool Registry ---

export interface IToolRegistry {
  /** Register a tool */
  register(tool: ITool): void;
  /** Register multiple tools at once */
  registerAll(tools: ITool[]): void;
  /** Look up a tool by name */
  get(name: string): ITool | undefined;
  /** Get all registered tools */
  getAll(): ITool[];
  /** Get OpenAI function-calling tool definitions, optionally filtered */
  getToolDefinitions(filter?: (tool: ITool) => boolean): Array<{ type: 'function'; function: any }>;
  /** Execute a tool by name with the given arguments and context */
  execute(name: string, args: any, context: ToolExecutionContext): Promise<ToolResult>;
  /** Check whether a tool is registered */
  has(name: string): boolean;
}

// --- Agent Registry ---

export interface IAgentRegistry {
  /** Register an agent definition + factory */
  register(definition: any, factory: () => IAgent): void;
  /** Look up an agent by type identifier */
  get(type: string): IAgent | undefined;
  /** Get all registered agent types */
  getAll(): Array<{ definition: any; agent: IAgent }>;
  /** Select the best agent for a given input and context */
  select(input: string, context: any): IAgent;
}

// --- Skill Registry ---

export interface ISkillRegistry {
  /** Register a skill */
  register(skill: ISkill): void;
  /** Look up a skill by id */
  get(id: string): ISkill | undefined;
  /** Get all registered skills */
  getAll(): ISkill[];
  /** Find skills matching a trigger keyword */
  findByTrigger(keyword: string): ISkill[];
  /** Load skill definitions from a directory of JSON files */
  loadFromDirectory(dirPath: string): Promise<void>;
}
