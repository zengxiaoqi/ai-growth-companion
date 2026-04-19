/**
 * ToolRegistryModule — NestJS module providing the tool registry.
 *
 * Import this module to get access to the IToolRegistry.
 * Tools decorated with @RegisterTool() are auto-discovered
 * via NestJS DiscoveryService in onModuleInit().
 *
 * Tool implementations should be registered as providers in the
 * module that owns their dependencies (e.g. AiModule). The
 * DiscoveryService will find all @RegisterTool() decorated classes
 * across the entire application.
 */

import { Global, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { ToolRegistryService } from "./tool-registry.service";

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class ToolRegistryModule {}
