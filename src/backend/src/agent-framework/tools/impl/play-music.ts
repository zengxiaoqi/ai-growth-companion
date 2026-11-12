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
      '播放一首歌曲。用户说"播放音乐""我想听歌""放一首小星星""播放全部都给你"时调用。'
      + 'query 必须逐字填入用户说的歌名或歌手原文（说"播放全部都给你"就传"全部都给你"），'
      + '不要替换成示例歌曲（如小星星）或泛类（如儿歌）；搜不到时工具会如实返回，由你告诉孩子没找到，不要擅自换一首歌。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '用户说的歌名或歌手原文，逐字传入，不要换成别的歌，如"小星星""两只老虎""全部都给你"',
        },
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