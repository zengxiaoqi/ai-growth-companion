import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { UsersModule } from '../users/users.module';
import { AbilitiesModule } from '../abilities/abilities.module';
import { LearningModule } from '../learning/learning.module';
import { ContentsModule } from '../contents/contents.module';
import { RecommendModule } from '../recommend/recommend.module';
import { ParentModule } from '../parent/parent.module';
import { ContentSafetyService } from '../../common/services/content-safety.service';
import { Conversation, ConversationMessage } from './conversation/conversation.entity';
import { ConversationManager } from './conversation/conversation-manager';
import { LlmConfig } from './llm/llm.config';
import { LlmClient } from './llm/llm-client';
import { AgentExecutor } from './agent/agent-executor';
import { ToolRegistry } from './agent/tool-registry';
import { GetUserProfileTool } from './agent/tools/get-user-profile';
import { GetAbilitiesTool } from './agent/tools/get-abilities';
import { GetLearningHistoryTool } from './agent/tools/get-learning-history';
import { SearchContentTool } from './agent/tools/search-content';
import { GetRecommendationsTool } from './agent/tools/get-recommendations';
import { GenerateQuizTool } from './agent/tools/generate-quiz';
import { GenerateActivityTool } from './agent/tools/generate-activity';
import { AssignActivityTool } from './agent/tools/assign-activity';
import { AssignmentModule } from '../assignment/assignment.module';
import { RecordLearningTool } from './agent/tools/record-learning';
import { GetParentControlTool } from './agent/tools/get-parent-control';
import { ListChildrenTool } from './agent/tools/list-children';
import { ViewReportTool } from './agent/tools/view-report';
import { ViewAbilitiesTool } from './agent/tools/view-abilities';
import { UpdateParentControlTool } from './agent/tools/update-parent-control';
import { ListAssignmentsTool } from './agent/tools/list-assignments';
import { ReportModule } from '../report/report.module';

@Module({
  imports: [
    UsersModule,
    AbilitiesModule,
    LearningModule,
    ContentsModule,
    RecommendModule,
    ParentModule,
    AssignmentModule,
    ReportModule,
    ConfigModule,
    TypeOrmModule.forFeature([Conversation, ConversationMessage]),
  ],
  providers: [
    AiService,
    ContentSafetyService,
    // LLM layer
    LlmConfig,
    LlmClient,
    // Conversation layer
    ConversationManager,
    // Agent layer
    AgentExecutor,
    ToolRegistry,
    // Tool handlers
    GetUserProfileTool,
    GetAbilitiesTool,
    GetLearningHistoryTool,
    SearchContentTool,
    GetRecommendationsTool,
    GenerateQuizTool,
    GenerateActivityTool,
    AssignActivityTool,
    RecordLearningTool,
    GetParentControlTool,
    ListChildrenTool,
    ViewReportTool,
    ViewAbilitiesTool,
    UpdateParentControlTool,
    ListAssignmentsTool,
  ],
  controllers: [AiController],
  exports: [AiService, GenerateActivityTool],
})
export class AiModule {}
