/**
 * @ToolMeta() — decorator for attaching metadata directly to tool classes.
 *
 * Alternative to defining metadata as a class property.
 * Useful when metadata should be computed or externalized.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * @ToolMeta({ requiresChildId: true })
 * export class MyTool extends BaseTool { ... }
 * ```
 */

import type { ToolMetadata } from "../../core";

export const TOOL_META_KEY = "__agent_framework_tool_meta__";

export function ToolMeta(overrides: Partial<ToolMetadata>): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(TOOL_META_KEY, overrides, target);
  };
}

/** Retrieve @ToolMeta() overrides for a class, if any */
export function getToolMeta(target: any): Partial<ToolMetadata> | undefined {
  return Reflect.getMetadata(TOOL_META_KEY, target);
}
