/**
 * ToolRegistryModule — NestJS module providing the tool registry.
 *
 * Import this module to get access to the IToolRegistry.
 * Tools decorated with @RegisterTool() are auto-discovered.
 */

import { Global, Module } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';

@Global()
@Module({
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class ToolRegistryModule {}
