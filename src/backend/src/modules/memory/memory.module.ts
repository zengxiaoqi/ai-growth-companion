import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Conversation,
  ConversationMessage,
} from '../../database/entities/conversation.entity';
import { CareModule } from '../care/care.module';
import { MemoryRecallService } from './memory-recall.service';
import { MemoryVectorService } from './memory-vector.service';
import { MemoryWriteService } from './memory-write.service';
import { Memory } from './memory.entity';
import { MemoryService } from './memory.service';
import { RecallAudit } from './recall-audit.entity';

/**
 * Long-term memory: two tools, four gates, four exits.
 *
 * Note what this module does *not* import: nothing from `modules/ai` other
 * than the conversation entities. The memory layer reads the transcript
 * through TypeORM directly, so there is no provider cycle between the
 * agent that calls the tools and the tools themselves.
 */
@Module({
  imports: [
    ConfigModule,
    CareModule,
    TypeOrmModule.forFeature([
      Memory,
      RecallAudit,
      Conversation,
      ConversationMessage,
    ]),
  ],
  providers: [
    MemoryVectorService,
    MemoryWriteService,
    MemoryRecallService,
    MemoryService,
  ],
  exports: [MemoryService, MemoryRecallService, MemoryWriteService],
})
export class MemoryModule {}
