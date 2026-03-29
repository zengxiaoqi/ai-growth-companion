import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { AbilityAssessment } from '../../database/entities/ability-assessment.entity';
import { Achievement } from '../../database/entities/achievement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningRecord, AbilityAssessment, Achievement]),
  ],
  providers: [ReportService],
  controllers: [ReportController],
  exports: [ReportService],
})
export class ReportModule {}