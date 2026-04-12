/**
 * Conversation Module — provides conversation and message management.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, ConversationMessage } from './entities';
import { ConversationService } from './conversation.service';
import { MessageBuilderService } from './message-builder.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, ConversationMessage])],
  providers: [ConversationService, MessageBuilderService],
  exports: [ConversationService, MessageBuilderService],
})
export class ConversationModule {}
