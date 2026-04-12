import { Module, forwardRef } from '@nestjs/common';
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
import { GenerateCoursePackTool as LegacyGenerateCoursePackTool } from './agent/tools/generate-course-pack';
import { GenerateVideoDataTool } from './agent/tools/generate-video-data';
import { ReportModule } from '../report/report.module';
import { VoiceModule } from '../voice/voice.module';

// Agent Framework — new multi-agent system
import { AgentFrameworkModule } from '../../agent-framework';
// Framework tools that need service dependencies resolved here
import { GetUserProfileTool as FwGetUserProfile } from '../../agent-framework/tools/impl/get-user-profile';
import { GetAbilitiesTool as FwGetAbilities } from '../../agent-framework/tools/impl/get-abilities';
import { GetLearningHistoryTool as FwGetLearningHistory } from '../../agent-framework/tools/impl/get-learning-history';
import { SearchContentTool as FwSearchContent } from '../../agent-framework/tools/impl/search-content';
import { GetRecommendationsTool as FwGetRecommendations } from '../../agent-framework/tools/impl/get-recommendations';
import { GetParentControlTool as FwGetParentControl } from '../../agent-framework/tools/impl/get-parent-control';
import { ListChildrenTool as FwListChildren } from '../../agent-framework/tools/impl/list-children';
import { ViewReportTool as FwViewReport } from '../../agent-framework/tools/impl/view-report';
import { ViewAbilitiesTool as FwViewAbilities } from '../../agent-framework/tools/impl/view-abilities';
import { RecordLearningTool as FwRecordLearning } from '../../agent-framework/tools/impl/record-learning';
import { UpdateParentControlTool as FwUpdateParentControl } from '../../agent-framework/tools/impl/update-parent-control';
import { ListAssignmentsTool as FwListAssignments } from '../../agent-framework/tools/impl/list-assignments';
import { GenerateQuizTool as FwGenerateQuiz } from '../../agent-framework/tools/impl/generate-quiz';
import { GenerateVideoDataTool as FwGenerateVideoData } from '../../agent-framework/tools/impl/generate-video-data';
import { GenerateActivityTool as FwGenerateActivity } from '../../agent-framework/tools/impl/generate-activity';
import { AssignActivityTool as FwAssignActivity } from '../../agent-framework/tools/impl/assign-activity';
import { GenerateCoursePackTool as FwGenerateCoursePack } from '../../agent-framework/tools/impl/generate-course-pack';

@Module({
  imports: [
    UsersModule,
    AbilitiesModule,
    forwardRef(() => LearningModule),
    ContentsModule,
    RecommendModule,
    ParentModule,
    forwardRef(() => AssignmentModule),
    ReportModule,
    VoiceModule,
    ConfigModule,
    TypeOrmModule.forFeature([Conversation, ConversationMessage]),
    // New agent framework
    AgentFrameworkModule,
  ],
  providers: [
    AiService,
    ContentSafetyService,
    // LLM layer (legacy)
    LlmConfig,
    LlmClient,
    // Conversation layer (legacy)
    ConversationManager,
    // Agent layer (legacy)
    AgentExecutor,
    ToolRegistry,
    // Legacy tool handlers
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
    LegacyGenerateCoursePackTool,
    GenerateVideoDataTool,
    // Framework tools — providers declared here so their service dependencies resolve
    FwGetUserProfile,
    FwGetAbilities,
    FwGetLearningHistory,
    FwSearchContent,
    FwGetRecommendations,
    FwGetParentControl,
    FwListChildren,
    FwViewReport,
    FwViewAbilities,
    FwRecordLearning,
    FwUpdateParentControl,
    FwListAssignments,
    FwGenerateQuiz,
    FwGenerateVideoData,
    FwGenerateActivity,
    FwAssignActivity,
    // Provide legacy course pack tool as the backing implementation
    {
      provide: FwGenerateCoursePack,
      useFactory: (legacy: LegacyGenerateCoursePackTool) => new FwGenerateCoursePack(legacy),
      inject: [LegacyGenerateCoursePackTool],
    },
  ],
  controllers: [AiController],
  exports: [AiService, GenerateActivityTool, LegacyGenerateCoursePackTool, GenerateVideoDataTool, LlmClient],
})
export class AiModule {}
