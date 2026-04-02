import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../../database/entities/assignment.entity';
import { AssignmentService } from './assignment.service';
import { AssignmentController } from './assignment.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Assignment])],
  providers: [AssignmentService],
  controllers: [AssignmentController],
  exports: [AssignmentService],
})
export class AssignmentModule {}
