/**
 * MessageBuilder — extracted from ConversationManager.buildMessageArray().
 *
 * Rebuilds valid LLM message arrays from flat database records,
 * ensuring tool-call blocks are never split.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';

/** A flat message record from the database */
export interface FlatMessageRecord {
  role: string;
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  toolName?: string;
}

@Injectable()
export class MessageBuilderService {
  private readonly logger = new Logger(MessageBuilderService.name);

  /**
   * Build a valid LLM message array from flat message records.
   * Groups assistant+tool_calls with their corresponding tool results
   * into atomic blocks that must not be split.
   *
   * @param messages - Flat message records ordered by creation time
   * @param maxMessages - Maximum number of individual messages to include
   * @returns Valid ChatCompletionMessageParam array
   */
  buildMessageArray(
    messages: FlatMessageRecord[],
    maxMessages = 20,
  ): ChatCompletionMessageParam[] {
    // Build valid blocks so we never split assistant(tool_calls) from tool results.
    const blocks: ChatCompletionMessageParam[][] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'system') {
        blocks.push([{ role: 'system', content: msg.content }]);
        continue;
      }

      if (msg.role === 'user') {
        blocks.push([{ role: 'user', content: msg.content }]);
        continue;
      }

      if (msg.role === 'assistant') {
        const toolCalls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
        if (toolCalls.length === 0) {
          blocks.push([{ role: 'assistant', content: msg.content }]);
          continue;
        }

        const pendingToolIds = new Set(
          toolCalls
            .map((call: any) => (typeof call?.id === 'string' ? call.id : null))
            .filter((id: string | null): id is string => Boolean(id)),
        );

        if (pendingToolIds.size === 0) {
          blocks.push([{ role: 'assistant', content: msg.content }]);
          continue;
        }

        const block: ChatCompletionMessageParam[] = [{
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolCalls,
        } as ChatCompletionMessageParam];

        let j = i + 1;
        while (j < messages.length && pendingToolIds.size > 0) {
          const toolMsg = messages[j];
          if (toolMsg.role !== 'tool') break;

          if (toolMsg.toolCallId && pendingToolIds.has(toolMsg.toolCallId)) {
            block.push({
              role: 'tool',
              content: toolMsg.content,
              tool_call_id: toolMsg.toolCallId,
            } as ChatCompletionMessageParam);
            pendingToolIds.delete(toolMsg.toolCallId);
          }
          j++;
        }

        if (pendingToolIds.size === 0) {
          blocks.push(block);
        } else {
          this.logger.warn(
            `Skip incomplete tool-call block: missing ${pendingToolIds.size} tool result(s)`,
          );
        }

        i = j - 1;
        continue;
      }

      // Drop dangling tool messages without a preceding assistant(tool_calls)
      if (msg.role === 'tool') {
        continue;
      }
    }

    // Keep tail blocks without breaking a block boundary.
    const selectedBlocks: ChatCompletionMessageParam[][] = [];
    let selectedCount = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      const blockSize = block.length;

      if (selectedCount + blockSize > maxMessages) {
        if (selectedBlocks.length === 0) {
          selectedBlocks.unshift(block);
        }
        break;
      }

      selectedBlocks.unshift(block);
      selectedCount += blockSize;
    }

    return selectedBlocks.flat();
  }
}
