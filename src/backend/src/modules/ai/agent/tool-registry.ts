import { Injectable, Logger } from '@nestjs/common';
import { toolDefinitions } from './prompts/tool-definitions';
import { GetUserProfileTool } from './tools/get-user-profile';
import { GetAbilitiesTool } from './tools/get-abilities';
import { GetLearningHistoryTool } from './tools/get-learning-history';
import { SearchContentTool } from './tools/search-content';
import { GetRecommendationsTool } from './tools/get-recommendations';
import { GenerateQuizTool } from './tools/generate-quiz';
import { GenerateActivityTool } from './tools/generate-activity';
import { AssignActivityTool } from './tools/assign-activity';
import { RecordLearningTool } from './tools/record-learning';
import { GetParentControlTool } from './tools/get-parent-control';
import { ListChildrenTool } from './tools/list-children';
import { ViewReportTool } from './tools/view-report';
import { ViewAbilitiesTool } from './tools/view-abilities';
import { UpdateParentControlTool } from './tools/update-parent-control';
import { ListAssignmentsTool } from './tools/list-assignments';
import { GenerateCoursePackTool } from './tools/generate-course-pack';
import { EnqueueTeachingVideoTool } from './tools/enqueue-teaching-video';
import { QueryBookSkillTool } from './tools/query-book-skill';
import { GenerateBookLessonTool } from './tools/generate-book-lesson';
import { RecallMemoryTool } from './tools/recall-memory';
import { SaveMemoryTool } from './tools/save-memory';
import { requiresParentApproval, toolRiskOf } from '../../../common/policy/tool-risk';
import type { ToolActorContext } from '../../../common/policy/tool-risk';
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly handlers: Map<string, (args: any) => Promise<string>>;

  constructor(
    private readonly getUserProfileTool: GetUserProfileTool,
    private readonly getAbilitiesTool: GetAbilitiesTool,
    private readonly getLearningHistoryTool: GetLearningHistoryTool,
    private readonly searchContentTool: SearchContentTool,
    private readonly getRecommendationsTool: GetRecommendationsTool,
    private readonly generateQuizTool: GenerateQuizTool,
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly assignActivityTool: AssignActivityTool,
    private readonly recordLearningTool: RecordLearningTool,
    private readonly getParentControlTool: GetParentControlTool,
    private readonly listChildrenTool: ListChildrenTool,
    private readonly viewReportTool: ViewReportTool,
    private readonly viewAbilitiesTool: ViewAbilitiesTool,
    private readonly updateParentControlTool: UpdateParentControlTool,
    private readonly listAssignmentsTool: ListAssignmentsTool,
    private readonly generateCoursePackTool: GenerateCoursePackTool,
    private readonly enqueueTeachingVideoTool: EnqueueTeachingVideoTool,
    private readonly queryBookSkillTool: QueryBookSkillTool,
    private readonly generateBookLessonTool: GenerateBookLessonTool,
    // Appended last so every earlier parameter keeps its position.
    private readonly recallMemoryTool?: RecallMemoryTool,
    private readonly saveMemoryTool?: SaveMemoryTool,
  ) {
    this.handlers = new Map([
      ['getUserProfile', (args) => this.getUserProfileTool.execute(args)],
      ['getAbilities', (args) => this.getAbilitiesTool.execute(args)],
      ['getLearningHistory', (args) => this.getLearningHistoryTool.execute(args)],
      ['searchContent', (args) => this.searchContentTool.execute(args)],
      ['getRecommendations', (args) => this.getRecommendationsTool.execute(args)],
      ['generateQuiz', (args) => this.generateQuizTool.execute(args)],
      ['generateActivity', (args) => this.generateActivityTool.execute(args)],
      ['assignActivity', (args) => this.assignActivityTool.execute(args)],
      ['recordLearning', (args) => this.recordLearningTool.execute(args)],
      ['getParentControl', (args) => this.getParentControlTool.execute(args)],
      ['listChildren', (args) => this.listChildrenTool.execute(args)],
      ['viewReport', (args) => this.viewReportTool.execute(args)],
      ['viewAbilities', (args) => this.viewAbilitiesTool.execute(args)],
      ['updateParentControl', (args) => this.updateParentControlTool.execute(args)],
      ['listAssignments', (args) => this.listAssignmentsTool.execute(args)],
      ['generateCoursePack', (args) => this.generateCoursePackTool.execute(args)],
      ['enqueueTeachingVideo', (args) => this.enqueueTeachingVideoTool.execute(args)],
      ['queryBookSkill', (args) => this.queryBookSkillTool.execute(args)],
      ['generateBookLesson', (args) => this.generateBookLessonTool.execute(args)],
      ...(this.recallMemoryTool
        ? [['recallMemory', (args) => this.recallMemoryTool!.execute(args)] as const]
        : []),
      ...(this.saveMemoryTool
        ? [['saveMemory', (args) => this.saveMemoryTool!.execute(args)] as const]
        : []),
    ]);
  }

  /** Get all tool definitions for the LLM */
  getToolDefinitions(): ChatCompletionTool[] {
    return toolDefinitions;
  }

  /**
   * Execute a tool by name and return the result string.
   *
   * `actor` is supplied by the server (derived from the authenticated
   * session), never from the model's tool arguments.
   */
  async execute(
    toolName: string,
    args: Record<string, any>,
    actor: ToolActorContext = {},
  ): Promise<string> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      this.logger.warn(`Unknown tool called: ${toolName}`);
      return JSON.stringify({ error: `未知工具: ${toolName}` });
    }

    // An older draft read `__parentApproved` straight from the model's
    // tool arguments, so a prompt-injected `true` could grant its own
    // approval. Strip it before it reaches a handler; only server-side
    // `actor.parentApproved` can ever carry that meaning.
    const safeArgs: Record<string, any> = { ...(args ?? {}) };
    delete safeArgs.__parentApproved;

    const policy = toolRiskOf(toolName);
    if (policy.risk !== 'low') {
      this.logger.debug(`Tool ${toolName} risk=${policy.risk}`);
    }
    if (requiresParentApproval(toolName, actor)) {
      // A structured refusal rather than a throw: the model can explain
      // the boundary to the child and carry on with the conversation.
      this.logger.warn(`Tool ${toolName} blocked: needs parent approval`);
      return JSON.stringify({
        error: '这个操作需要家长确认后才能进行',
        reason: 'parent_approval_required',
      });
    }

    try {
      this.logger.log(`Tool called: ${toolName}(${JSON.stringify(safeArgs).slice(0, 100)})`);
      const result = await handler(safeArgs);
      this.logger.log(`Tool ${toolName} returned: ${result.slice(0, 100)}...`);
      return result;
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed: ${error.message}`);
      return JSON.stringify({ error: `工具执行失败: ${error.message}` });
    }
  }
}
