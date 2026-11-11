/**
 * PlayMusicTool — lets the child ask for a song in chat ("我想听小星星").
 * Reuses MusicService search/aggregation; the client plays via the existing
 * /music/audio/<token> capability URLs.
 *
 * Token URLs travel only in ToolResult.musicData (the music_data side channel):
 * `data` goes to the model and conversation history, so it carries titles and
 * artists but never URLs.
 */

import { Injectable } from '@nestjs/common';
import { MusicService } from '../../../modules/music/music.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type PlayMusicInput = { query: string };

const SEARCH_LIMIT = 5;

@Injectable()
@RegisterTool()
export class PlayMusicTool extends BaseTool<PlayMusicInput> {
  readonly metadata: ToolMetadata = {
    name: 'playMusic',
    description:
      '给孩子播放一首歌曲。孩子说"我想听歌""放一首小星星""播放两只老虎"时调用，传入歌名或歌手关键词。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '歌名或歌手关键词，如"小星星""两只老虎"' },
      },
      required: ['query'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly musicService: MusicService) {
    super();
  }

  async execute(args: PlayMusicInput, _context: ToolExecutionContext): Promise<ToolResult> {
    const query = args?.query?.trim();
    if (!query) return this.fail('请告诉我歌名');
    try {
      const result = await this.musicService.search(query, SEARCH_LIMIT);
      if (!result.enabled) return this.fail('音乐功能暂未开启');
      if (result.tracks.length === 0) {
        return this.fail(`没有找到「${query}」相关的歌曲，换个歌名试试`);
      }
      return {
        success: true,
        data: {
          count: result.tracks.length,
          tracks: result.tracks.map((t) => ({
            title: t.title,
            artist: t.artist,
            duration_s: t.duration_s,
          })),
        },
        musicData: { tracks: result.tracks },
      };
    } catch (error: any) {
      return this.fail(`找歌失败: ${error.message}`);
    }
  }
}