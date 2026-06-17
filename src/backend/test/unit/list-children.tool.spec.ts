import { ListChildrenTool } from '../../src/modules/ai/agent/tools/list-children';

describe('ListChildrenTool', () => {
  const usersService = { findByParentId: jest.fn() };
  let tool: ListChildrenTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new ListChildrenTool(usersService as any);
  });

  it('returns mapped children list', async () => {
    usersService.findByParentId.mockResolvedValue([
      { id: 1, name: '小明', age: 4, gender: 'male', avatar: 'a1.png' },
      { id: 2, name: '小红', age: 5, gender: 'female', avatar: 'a2.png' },
    ]);

    const result = JSON.parse(await tool.execute({ parentId: 10 }));
    expect(result.children).toHaveLength(2);
    expect(result.children[0]).toEqual({
      id: 1,
      name: '小明',
      age: 4,
      gender: 'male',
      avatar: 'a1.png',
    });
    expect(usersService.findByParentId).toHaveBeenCalledWith(10);
  });

  it('returns empty array when no children', async () => {
    usersService.findByParentId.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ parentId: 10 }));
    expect(result.children).toEqual([]);
  });

  it('returns error on service exception', async () => {
    usersService.findByParentId.mockRejectedValue(new Error('timeout'));

    const result = JSON.parse(await tool.execute({ parentId: 10 }));
    expect(result.error).toContain('获取孩子列表失败');
  });
});
