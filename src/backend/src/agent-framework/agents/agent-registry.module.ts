/**
 * AgentRegistryModule — NestJS module for the agent registry service.
 *
 * Provides the AgentRegistryService as a global singleton so that
 * agent definitions can be registered from any module.
 */

import { Global, Module } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';

@Global()
@Module({
  providers: [AgentRegistryService],
  exports: [AgentRegistryService],
})
export class AgentRegistryModule {}
