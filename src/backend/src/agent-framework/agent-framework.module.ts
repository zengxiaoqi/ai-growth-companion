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
import { LlmClientService } from './llm/llm-client.service';
import { ToolRegistryModule } from './tools/tool-registry.module';
import { ToolRegistryService } from './tools/tool-registry.service';
import { AgentRegistryModule } from './agents/agent-registry.module';
import { AgentRegistryService } from './agents/agent-registry.service';
import { SkillRegistryModule } from './skills/skill-registry.module';
import { SkillRegistryService } from './skills/skill-registry.service';
import { ConversationModule } from './conversation/conversation.module';
import { SafetyModule } from './safety/safety.module';
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
    {
      provide: AgentExecutorService,
      useFactory: (toolRegistry: ToolRegistryService, llmClient: LlmClientService) =>
        new AgentExecutorService(toolRegistry, llmClient),
      inject: [ToolRegistryService, LlmClientService],
    },
    {
      provide: OrchestratorService,
      useFactory: (
        agentRegistry: AgentRegistryService,
        executor: AgentExecutorService,
        skillRegistry: SkillRegistryService,
        skillExecutor: SkillExecutor,
      ) =>
        new OrchestratorService(agentRegistry, executor, null as any, skillRegistry, skillExecutor),
      inject: [AgentRegistryService, AgentExecutorService, SkillRegistryService, SkillExecutor],
    },
    {
      provide: SubAgentFactory,
      useFactory: (agentRegistry: AgentRegistryService) =>
        new SubAgentFactory(agentRegistry),
      inject: [AgentRegistryService],
    },
    SkillExecutor,
    PromptProviderService,
  ],
  exports: [
    OrchestratorService,
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
    const agentDefinitions = [
      childCompanionDefinition,
      parentAdvisorDefinition,
      courseDesignerDefinition,
      activityGeneratorDefinition,
    ];

    for (const definition of agentDefinitions) {
      this.agentRegistry.register(definition, () => ({
        definition,
        execute: async () => ({ response: '', toolCalls: [] }),
        executeStream: async function* () {},
      }) as any);
    }
  }
}
