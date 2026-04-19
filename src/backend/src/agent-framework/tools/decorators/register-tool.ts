/**
 * @RegisterTool() — decorator that marks a class as a self-registering tool.
 *
 * Works with NestJS DiscoveryService to auto-register tools
 * into the ToolRegistry without manual wiring.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * @RegisterTool()
 * export class MyTool extends BaseTool { ... }
 * ```
 */

export const TOOL_REGISTRY_METADATA = "__agent_framework_tool__";

/**
 * Decorator that marks a class as an auto-registering tool.
 * The ToolRegistryService will discover all providers with this metadata
 * and register them automatically at module initialization.
 */
export function RegisterTool(): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(TOOL_REGISTRY_METADATA, true, target);
  };
}

/** Check if a class has the @RegisterTool() decorator */
export function isToolRegistered(target: any): boolean {
  return Reflect.getMetadata(TOOL_REGISTRY_METADATA, target) === true;
}
