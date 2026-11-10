/**
 * PlayStoryTool — wraps VoiceService story generation as an agent tool.
 * Enabled by default in 碎碎念 casual mode. Returns story text only; the
 * client's existing auto-read (TTS) voices it, so no audio blob is fed to
 * the model.
 */

import { Injectable } from '@nestjs/common';
import { VoiceService } from '../../../modules/voice/voice.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type PlayStoryInput = { topic: string };

@Injectable()
@RegisterTool()
export class PlayStoryTool extends BaseTool<PlayStoryInput> {
  readonly metadata: ToolMetadata = {
    name: 'playStory',
    description: '给孩子讲一个适合年龄的小故事。孩子说"讲个故事""我想听故事"时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '故事主题，如"小兔子""春天""分享"' },
      },
      required: ['topic'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: true,
  };

  constructor(private readonly voiceService: VoiceService) {
    super();
  }

  async execute(args: PlayStoryInput, context: ToolExecutionContext): Promise<ToolResult> {
    const topic = args?.topic?.trim() || '动物';
    const ageRange = context.ageGroup === '3-4' ? '3-4' : '5-6';
    try {
      const story = this.voiceService.buildStory(topic, ageRange);
      return this.ok({ title: story.title, content: story.content });
    } catch (error: any) {
      return this.fail(`讲故事失败: ${error.message}`);
    }
  }
}