/**
 * AgentFrameworkModule — root NestJS module for the agent framework.
 *
 * Imports and wires together all subsystems:
 * - LLM client
 * - Tool registry (auto-discovers @RegisterTool decorated classes)
 * - Agent registry + executor + orchestrator
 * - Skill registry + executor
 * - Prompt provider
 * - Conversation management
 * - Content safety
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { LlmModule } from './llm/llm.module';
import { ToolRegistryModule } from './tools/tool-registry.module';
import { AgentRegistryModule } from './agents/agent-registry.module';
import { SkillRegistryModule } from './skills/skill-registry.module';
import { ConversationModule } from './conversation/conversation.module';
import { SafetyModule } from './safety/safety.module';
import { AgentRegistryService } from './agents/agent-registry.service';
import { AgentExecutorService } from './agents/agent-executor.service';
import { OrchestratorService } from './agents/orchestrator.service';
import { SubAgentFactory } from './agents/sub-agent-factory';
import { SkillExecutor } from './skills/skill-executor';
import { PromptProviderService } from './prompts/prompt-provider.service';

// Agent definitions
import { childCompanionDefinition } from './agents/definitions/child-companion.agent';
import { parentAdvisorDefinition } from './agents/definitions/parent-advisor.agent';
import { courseDesignerDefinition } from './agents/definitions/course-designer.agent';
import { activityGeneratorDefinition } from './agents/definitions/activity-generator.agent';

@Module({
  imports: [
    LlmModule,
    ToolRegistryModule,
    AgentRegistryModule,
    SkillRegistryModule,
    ConversationModule,
    SafetyModule,
  ],
  providers: [
    AgentExecutorService,
    OrchestratorService,
    SubAgentFactory,
    SkillExecutor,
    PromptProviderService,
  ],
  exports: [
    OrchestratorService,
    AgentRegistryService,
    AgentExecutorService,
    SubAgentFactory,
    SkillRegistryModule,
    ToolRegistryModule,
    LlmModule,
    ConversationModule,
    SafetyModule,
    PromptProviderService,
  ],
})
export class AgentFrameworkModule implements OnModuleInit {
  constructor(private readonly agentRegistry: AgentRegistryService) {}

  /** Register built-in agent definitions on module init */
  onModuleInit() {
    // Register all built-in agents
    const agentDefinitions = [
      childCompanionDefinition,
      parentAdvisorDefinition,
      courseDesignerDefinition,
      activityGeneratorDefinition,
    ];

    for (const definition of agentDefinitions) {
      // Factory returns a placeholder — actual agent creation happens via AgentExecutorService
      this.agentRegistry.register(definition, () => ({
        definition,
        execute: async () => ({ response: '', toolCalls: [] }),
        executeStream: async function* () {},
      }) as any);
    }
  }
}
