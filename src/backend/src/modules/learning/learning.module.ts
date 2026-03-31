import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { ParentControl } from '../../database/entities/parent-control.entity';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [TypeOrmModule.forFeature([LearningRecord, ParentControl]), SseModule],
  providers: [LearningService],
  controllers: [LearningController],
  exports: [LearningService],
})
export class LearningModule {}