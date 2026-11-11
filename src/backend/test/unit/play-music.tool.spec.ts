import { PlayMusicTool } from '../../src/agent-framework/tools/impl/play-music';
import type { MusicService } from '../../src/modules/music/music.service';
import type { ToolExecutionContext } from '../../src/agent-framework/core';

describe('PlayMusicTool', () => {
  const context: ToolExecutionContext = {
    ageGroup: '5-6',
    conversationId: 'test-session',
    extra: {},
  };

  let musicService: { search: jest.Mock };
  let tool: PlayMusicTool;

  beforeEach(() => {
    musicService = { search: jest.fn() };
    tool = new PlayMusicTool(musicService as unknown as MusicService);
  });

  it('fails when the query is empty', async () => {
    const result = await tool.execute({ query: '  ' }, context);
    expect(result.success).toBe(false);
    expect(musicService.search).not.toHaveBeenCalled();
  });

  it('fails when music is disabled', async () => {
    musicService.search.mockResolvedValue({ enabled: false, tracks: [] });
    const result = await tool.execute({ query: '小星星' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('暂未开启');
    expect(result.musicData).toBeUndefined();
  });

  it('fails when no tracks are found', async () => {
    musicService.search.mockResolvedValue({ enabled: true, tracks: [] });
    const result = await tool.execute({ query: '不存在的歌' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('没有找到');
    expect(result.musicData).toBeUndefined();
  });

  it('keeps capability URLs out of data and puts them in musicData', async () => {
    const tracks = [
      { title: '小星星', artist: '儿歌多多', url: '/music/audio/abc123', duration_s: 74 },
      { title: '小星星', artist: '贝瓦儿歌', url: '/music/audio/def456', duration_s: 80 },
    ];
    musicService.search.mockResolvedValue({ enabled: true, tracks });

    const result = await tool.execute({ query: '小星星' }, context);

    expect(result.success).toBe(true);
    expect(musicService.search).toHaveBeenCalledWith('小星星', 5);
    // Model-facing data: titles/artists only, never URLs
    expect(JSON.stringify(result.data)).not.toContain('/music/audio/');
    expect((result.data as any).count).toBe(2);
    expect((result.data as any).tracks[0]).toEqual({
      title: '小星星',
      artist: '儿歌多多',
      duration_s: 74,
    });
    // Client-facing side channel carries the full payload
    expect(result.musicData).toEqual({ tracks });
  });

  it('fails gracefully when search throws', async () => {
    musicService.search.mockRejectedValue(new Error('boom'));
    const result = await tool.execute({ query: '小星星' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('找歌失败');
  });
});