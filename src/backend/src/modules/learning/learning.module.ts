import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LearningRecord])],
  providers: [LearningService],
  controllers: [LearningController],
  exports: [LearningService],
})
export class LearningModule {}