import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { ParentControl } from '../../database/entities/parent-control.entity';
import { Achievement } from '../../database/entities/achievement.entity';
import { Content } from '../../database/entities/content.entity';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';
import { LearningController } from './learning.controller';
import { SseModule } from '../sse/sse.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { AbilitiesModule } from '../abilities/abilities.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningRecord, ParentControl, Achievement, Content]),
    SseModule,
    AchievementsModule,
    AbilitiesModule,
  ],
  providers: [LearningService, LearningTrackerService],
  controllers: [LearningController],
  exports: [LearningService, LearningTrackerService],
})
export class LearningModule {}
