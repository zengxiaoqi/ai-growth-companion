import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbilityAssessment } from '../../database/entities/ability-assessment.entity';
import { AbilitiesService } from './abilities.service';
import { AbilitiesController } from './abilities.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AbilityAssessment])],
  providers: [AbilitiesService],
  controllers: [AbilitiesController],
  exports: [AbilitiesService],
})
export class AbilitiesModule {}