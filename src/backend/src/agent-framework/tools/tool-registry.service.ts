/**
 * ToolRegistryService — implements IToolRegistry using NestJS DiscoveryService.
 *
 * Tools auto-register via @RegisterTool() decorator.
 * No manual wiring needed — add a new tool class and it appears automatically.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type { ITool, IToolRegistry, ToolResult, ToolExecutionContext } from '../core';
import { TOOL_REGISTRY_METADATA } from './decorators/register-tool';

@Injectable()
export class ToolRegistryService implements IToolRegistry, OnModuleInit {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools: Map<string, ITool> = new Map();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Auto-discover all @RegisterTool() decorated providers */
  onModuleInit() {
    const providers: InstanceWrapper[] = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const metatype = this.resolveToolMetatype(wrapper);
      if (!metatype) continue;

      const instance = this.resolveToolInstance(wrapper, metatype);
      if (!instance) continue;

      if (!('metadata' in instance) || !('execute' in instance)) {
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

  private resolveToolMetatype(wrapper: InstanceWrapper): any {
    const candidates = [
      wrapper.metatype,
      typeof wrapper.token === 'function' ? wrapper.token : null,
      wrapper.instance?.constructor,
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (this.hasToolMetadata(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private hasToolMetadata(metatype: any): boolean {
    return Reflect.getMetadata(TOOL_REGISTRY_METADATA, metatype) === true;
  }

  private resolveToolInstance(wrapper: InstanceWrapper, metatype: any): Record<string, any> | null {
    const existing = wrapper.instance;
    if (existing && typeof existing === 'object') {
      return existing;
    }

    try {
      const token = wrapper.token ?? metatype;
      const resolved = this.moduleRef.get(token as any, { strict: false });
      if (resolved && typeof resolved === 'object') return resolved;
    } catch (error: any) {
      this.logger.warn(
        `Unable to resolve tool provider ${metatype?.name || String(wrapper.token)}: ${error?.message || 'unknown'}`,
      );
    }

    return null;
  }

  register(tool: ITool): void {
    if (this.tools.has(tool.metadata.name)) {
      this.logger.warn(`Tool "${tool.metadata.name}" already registered — overwriting`);
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
  ): Array<{ type: 'function'; function: any }> {
    const tools = filter ? this.getAll().filter(filter) : this.getAll();
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.metadata.name,
        description: tool.metadata.description,
        parameters: tool.metadata.inputSchema,
      },
    }));
  }

  /** Execute a tool by name with structured error handling */
  async execute(name: string, args: any, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      this.logger.warn(`Unknown tool called: ${name}`);
      return { success: false, error: `未知工具: ${name}` };
    }

    try {
      this.logger.log(`Tool called: ${name}(${JSON.stringify(args).slice(0, 100)})`);
      const result = await tool.execute(args, context);
      this.logger.log(`Tool ${name} returned: success=${result.success}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Tool ${name} failed: ${error.message}`);
      return { success: false, error: `工具执行失败: ${error.message}` };
    }
  }

  /** Execute a tool and return the result as a JSON string (backward-compatible) */
  async executeToString(name: string, args: any, context: ToolExecutionContext): Promise<string> {
    const result = await this.execute(name, args, context);
    return JSON.stringify(result.data ?? { error: result.error });
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
