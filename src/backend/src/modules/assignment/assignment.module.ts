import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../../database/entities/assignment.entity';
import { AssignmentService } from './assignment.service';
import { AssignmentController } from './assignment.controller';
import { AiModule } from '../ai/ai.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment]),
    forwardRef(() => AiModule),
    LearningModule,
  ],
  providers: [AssignmentService],
  controllers: [AssignmentController],
  exports: [AssignmentService],
})
export class AssignmentModule {}
