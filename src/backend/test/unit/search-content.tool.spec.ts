import { SearchContentTool } from '../../src/modules/ai/agent/tools/search-content';

describe('SearchContentTool', () => {
  const contentsService = { findAll: jest.fn() };
  let tool: SearchContentTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new SearchContentTool(contentsService as any);
  });

  it('returns filtered contents matching query keyword', async () => {
    contentsService.findAll.mockResolvedValue({
      list: [
        {
          id: 1,
          title: '认识动物',
          topic: '动物世界',
          domain: '科学',
          difficulty: 1,
          contentType: 'course',
          durationMinutes: 10,
        },
        {
          id: 2,
          title: '学数字',
          topic: '数字',
          domain: '数学',
          difficulty: 1,
          contentType: 'course',
          durationMinutes: 8,
        },
        {
          id: 3,
          title: '动物家庭',
          topic: '家庭',
          domain: '社会',
          difficulty: 2,
          contentType: 'game',
          durationMinutes: 5,
        },
      ],
    });

    const result = JSON.parse(await tool.execute({ query: '动物', ageRange: '3-4' }));
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0].title).toBe('认识动物');
    expect(result.contents[1].title).toBe('动物家庭');
  });

  it('returns no-results message when nothing matches', async () => {
    contentsService.findAll.mockResolvedValue({
      list: [{ id: 1, title: '学数字', topic: '数字' }],
    });

    const result = JSON.parse(await tool.execute({ query: '英语', ageRange: '5-6' }));
    expect(result.message).toContain('没有找到');
    expect(result.contents).toEqual([]);
  });

  it('limits results to 5 items', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      title: `动物${i}`,
      topic: 'test',
      domain: '科学',
      difficulty: 1,
      contentType: 'course',
      durationMinutes: 5,
    }));
    contentsService.findAll.mockResolvedValue({ list: items });

    const result = JSON.parse(await tool.execute({ query: '动物', ageRange: '3-4' }));
    expect(result.contents).toHaveLength(5);
  });

  it('passes domain filter to service', async () => {
    contentsService.findAll.mockResolvedValue({ list: [] });

    await tool.execute({ query: 'test', ageRange: '5-6', domain: '科学' });
    expect(contentsService.findAll).toHaveBeenCalledWith({
      ageRange: '5-6',
      domain: '科学',
    });
  });

  it('returns error on service exception', async () => {
    contentsService.findAll.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ query: 'test', ageRange: '3-4' }));
    expect(result.error).toContain('搜索内容失败');
  });
});
