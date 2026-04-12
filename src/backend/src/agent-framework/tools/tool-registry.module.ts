/**
 * ToolRegistryModule — NestJS module providing the tool registry.
 *
 * Import this module to get access to the IToolRegistry.
 * Tools decorated with @RegisterTool() are auto-discovered
 * via NestJS DiscoveryService in onModuleInit().
 *
 * All tool implementations are declared as providers here so
 * their dependencies are resolved by the NestJS DI container.
 */

import { Global, Module } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';

// Tool implementations
import { GetUserProfileTool } from './impl/get-user-profile';
import { GetAbilitiesTool } from './impl/get-abilities';
import { GetLearningHistoryTool } from './impl/get-learning-history';
import { SearchContentTool } from './impl/search-content';
import { GetRecommendationsTool } from './impl/get-recommendations';
import { GetParentControlTool } from './impl/get-parent-control';
import { ListChildrenTool } from './impl/list-children';
import { ViewReportTool } from './impl/view-report';
import { ViewAbilitiesTool } from './impl/view-abilities';
import { RecordLearningTool } from './impl/record-learning';
import { UpdateParentControlTool } from './impl/update-parent-control';
import { ListAssignmentsTool } from './impl/list-assignments';
import { GenerateQuizTool } from './impl/generate-quiz';
import { GenerateVideoDataTool } from './impl/generate-video-data';
import { GenerateActivityTool } from './impl/generate-activity';
import { AssignActivityTool } from './impl/assign-activity';
import { GenerateCoursePackTool } from './impl/generate-course-pack';

const TOOL_PROVIDERS = [
  GetUserProfileTool,
  GetAbilitiesTool,
  GetLearningHistoryTool,
  SearchContentTool,
  GetRecommendationsTool,
  GetParentControlTool,
  ListChildrenTool,
  ViewReportTool,
  ViewAbilitiesTool,
  RecordLearningTool,
  UpdateParentControlTool,
  ListAssignmentsTool,
  GenerateQuizTool,
  GenerateVideoDataTool,
  GenerateActivityTool,
  AssignActivityTool,
  GenerateCoursePackTool,
];

@Global()
@Module({
  providers: [ToolRegistryService, ...TOOL_PROVIDERS],
  exports: [ToolRegistryService],
})
export class ToolRegistryModule {}
