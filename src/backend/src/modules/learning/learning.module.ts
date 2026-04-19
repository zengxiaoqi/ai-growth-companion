import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LearningRecord } from "../../database/entities/learning-record.entity";
import { ParentControl } from "../../database/entities/parent-control.entity";
import { Achievement } from "../../database/entities/achievement.entity";
import { Content } from "../../database/entities/content.entity";
import { Assignment } from "../../database/entities/assignment.entity";
import { LearningPoint } from "../../database/entities/learning-point.entity";
import { WrongQuestion } from "../../database/entities/wrong-question.entity";
import { StudyPlanRecord } from "../../database/entities/study-plan-record.entity";
import { VideoGenerationTask } from "../../database/entities/video-generation-task.entity";
import { LearningService } from "./learning.service";
import { LearningTrackerService } from "./learning-tracker.service";
import { LearningArchiveService } from "./learning-archive.service";
import { LessonContentService } from "./lesson-content.service";
import { LessonVideoQueueService } from "./lesson-video-queue.service";
import { RemotionRenderService } from "./remotion-render.service";
import { LearningController } from "./learning.controller";
import { SseModule } from "../sse/sse.module";
import { AchievementsModule } from "../achievements/achievements.module";
import { AbilitiesModule } from "../abilities/abilities.module";
import { UsersModule } from "../users/users.module";
import { AiModule } from "../ai/ai.module";
import { ContentsModule } from "../contents/contents.module";
import { AssignmentModule } from "../assignment/assignment.module";
import { VoiceModule } from "../voice/voice.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningRecord,
      ParentControl,
      Achievement,
      Content,
      Assignment,
      LearningPoint,
      WrongQuestion,
      StudyPlanRecord,
      VideoGenerationTask,
    ]),
    SseModule,
    AchievementsModule,
    AbilitiesModule,
    UsersModule,
    forwardRef(() => AiModule),
    ContentsModule,
    forwardRef(() => AssignmentModule),
    VoiceModule,
  ],
  providers: [
    LearningService,
    LearningTrackerService,
    LearningArchiveService,
    LessonContentService,
    LessonVideoQueueService,
    RemotionRenderService,
  ],
  controllers: [LearningController],
  exports: [
    LearningService,
    LearningTrackerService,
    LearningArchiveService,
    LessonContentService,
    LessonVideoQueueService,
    RemotionRenderService,
  ],
})
export class LearningModule {}
