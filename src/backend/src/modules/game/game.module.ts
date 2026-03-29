import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LearningRecord])],
  providers: [GameService],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}