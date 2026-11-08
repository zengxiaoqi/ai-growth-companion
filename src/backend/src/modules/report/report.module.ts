import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { AbilityAssessment } from '../../database/entities/ability-assessment.entity';
import { Achievement } from '../../database/entities/achievement.entity';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningRecord, AbilityAssessment, Achievement]),
    // Report reads memories directly (bypassing the model's tool choice):
    // the parent digest is where long-term memory actually pays off.
    MemoryModule,
  ],
  providers: [ReportService],
  controllers: [ReportController],
  exports: [ReportService],
})
export class ReportModule {}
