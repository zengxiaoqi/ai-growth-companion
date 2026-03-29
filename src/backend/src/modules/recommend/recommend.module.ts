import { Module } from '@nestjs/common';
import { RecommendService } from './recommend.service';
import { RecommendController } from './recommend.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { Content } from '../../database/entities/content.entity';
import { AbilityAssessment } from '../../database/entities/ability-assessment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningRecord, Content, AbilityAssessment]),
  ],
  providers: [RecommendService],
  controllers: [RecommendController],
  exports: [RecommendService],
})
export class RecommendModule {}