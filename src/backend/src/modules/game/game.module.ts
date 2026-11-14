import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { QuestionBankService } from './question-bank.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { Content } from '../../database/entities/content.entity';
import { QuestionItem } from '../../database/entities/question-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LearningRecord, Content, QuestionItem])],
  providers: [GameService, QuestionBankService],
  controllers: [GameController],
  exports: [GameService, QuestionBankService],
})
export class GameModule {}
