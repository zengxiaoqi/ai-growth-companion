import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { ParentControl } from '../../database/entities/parent-control.entity';
import { Achievement } from '../../database/entities/achievement.entity';
import { Content } from '../../database/entities/content.entity';
import { LearningPoint } from '../../database/entities/learning-point.entity';
import { WrongQuestion } from '../../database/entities/wrong-question.entity';
import { StudyPlanRecord } from '../../database/entities/study-plan-record.entity';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';
import { LearningArchiveService } from './learning-archive.service';
import { LearningController } from './learning.controller';
import { SseModule } from '../sse/sse.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { AbilitiesModule } from '../abilities/abilities.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningRecord,
      ParentControl,
      Achievement,
      Content,
      LearningPoint,
      WrongQuestion,
      StudyPlanRecord,
    ]),
    SseModule,
    AchievementsModule,
    AbilitiesModule,
    UsersModule,
  ],
  providers: [LearningService, LearningTrackerService, LearningArchiveService],
  controllers: [LearningController],
  exports: [LearningService, LearningTrackerService, LearningArchiveService],
})
export class LearningModule {}
