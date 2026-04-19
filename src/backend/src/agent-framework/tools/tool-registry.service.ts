/**
 * ToolRegistryService — implements IToolRegistry using NestJS DiscoveryService.
 *
 * Tools auto-register via @RegisterTool() decorator.
 * No manual wiring needed — add a new tool class and it appears automatically.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { InstanceWrapper } from "@nestjs/core/injector/instance-wrapper";
import type {
  ITool,
  IToolRegistry,
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../core";
import { ToolNotFoundError, ToolExecutionError } from "../core";
import { TOOL_REGISTRY_METADATA } from "./decorators/register-tool";

@Injectable()
export class ToolRegistryService implements IToolRegistry, OnModuleInit {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools: Map<string, ITool> = new Map();

  constructor(private readonly discoveryService: DiscoveryService) {}

  /** Auto-discover all @RegisterTool() decorated providers */
  onModuleInit() {
    const providers: InstanceWrapper[] = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== "object") continue;

      const metatype = wrapper.metatype;
      if (!metatype) continue;

      const hasToolMeta = Reflect.getMetadata(TOOL_REGISTRY_METADATA, metatype);
      if (!hasToolMeta) continue;

      if (!("metadata" in instance) || !("execute" in instance)) {
        this.logger.warn(
          `@RegisterTool() on ${metatype.name} but missing metadata/execute — skipping`,
        );
        continue;
      }

      const tool = instance as ITool;
      this.register(tool);
      this.logger.log(`Auto-registered tool: ${tool.metadata.name}`);
    }

    this.logger.log(`ToolRegistry initialized with ${this.tools.size} tools`);
  }

  register(tool: ITool): void {
    if (this.tools.has(tool.metadata.name)) {
      this.logger.warn(
        `Tool "${tool.metadata.name}" already registered — overwriting`,
      );
    }
    this.tools.set(tool.metadata.name, tool);
  }

  registerAll(tools: ITool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /** Build OpenAI function-calling tool definitions, optionally filtered */
  getToolDefinitions(
    filter?: (tool: ITool) => boolean,
  ): Array<{ type: "function"; function: any }> {
    const tools = filter ? this.getAll().filter(filter) : this.getAll();
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.metadata.name,
        description: tool.metadata.description,
        parameters: tool.metadata.inputSchema,
      },
    }));
  }

  /** Execute a tool by name with structured error handling */
  async execute(
    name: string,
    args: any,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      this.logger.warn(`Unknown tool called: ${name}`);
      return { success: false, error: `未知工具: ${name}` };
    }

    try {
      this.logger.log(
        `Tool called: ${name}(${JSON.stringify(args).slice(0, 100)})`,
      );
      const result = await tool.execute(args, context);
      this.logger.log(`Tool ${name} returned: success=${result.success}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Tool ${name} failed: ${error.message}`);
      return { success: false, error: `工具执行失败: ${error.message}` };
    }
  }

  /** Execute a tool and return the result as a JSON string (backward-compatible) */
  async executeToString(
    name: string,
    args: any,
    context: ToolExecutionContext,
  ): Promise<string> {
    const result = await this.execute(name, args, context);
    return JSON.stringify(result.data ?? { error: result.error });
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
