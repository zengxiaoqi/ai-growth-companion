import { ContentsController } from '../../src/modules/contents/contents.controller';

describe('ContentsController', () => {
  const contentsService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };

  let controller: ContentsController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ContentsController(contentsService as any);
  });

  describe('findAll', () => {
    it('should return paginated results with default params', async () => {
      const mockResult = {
        list: [
          { id: 1, title: '内容1', ageRange: '3-4' },
          { id: 2, title: '内容2', ageRange: '5-6' },
        ],
        total: 2,
        page: 1,
        limit: 20,
      };
      contentsService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll({});

      expect(result).toEqual(mockResult);
      expect(contentsService.findAll).toHaveBeenCalledWith({});
    });

    it('should pass ageRange query filter to service', async () => {
      contentsService.findAll.mockResolvedValue({ list: [], total: 0 });

      await controller.findAll({ ageRange: '3-4' });

      expect(contentsService.findAll).toHaveBeenCalledWith({ ageRange: '3-4' });
    });

    it('should pass domain query filter to service', async () => {
      contentsService.findAll.mockResolvedValue({ list: [], total: 0 });

      await controller.findAll({ domain: 'science' });

      expect(contentsService.findAll).toHaveBeenCalledWith({ domain: 'science' });
    });

    it('should pass search keyword to service', async () => {
      contentsService.findAll.mockResolvedValue({ list: [], total: 0 });

      await controller.findAll({ keyword: '熊猫' });

      expect(contentsService.findAll).toHaveBeenCalledWith({ keyword: '熊猫' });
    });

    it('should pass pagination params to service', async () => {
      contentsService.findAll.mockResolvedValue({ list: [], total: 0 });

      await controller.findAll({ page: 3, limit: 5 });

      expect(contentsService.findAll).toHaveBeenCalledWith({ page: 3, limit: 5 });
    });

    it('should pass childId filter to service', async () => {
      contentsService.findAll.mockResolvedValue({ list: [], total: 0 });

      await controller.findAll({ childId: 42 });

      expect(contentsService.findAll).toHaveBeenCalledWith({ childId: 42 });
    });

    it('should handle empty result set', async () => {
      contentsService.findAll.mockResolvedValue({
        list: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const result = await controller.findAll({});

      expect(result.list).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return content by numeric id', async () => {
      const mockContent = { id: 1, title: '测试内容', ageRange: '3-4' };
      contentsService.findById.mockResolvedValue(mockContent);

      const result = await controller.findById('1');

      expect(result).toEqual(mockContent);
      expect(contentsService.findById).toHaveBeenCalledWith(1);
    });

    it('should convert string id to number', async () => {
      contentsService.findById.mockResolvedValue(null);

      await controller.findById('42');

      expect(contentsService.findById).toHaveBeenCalledWith(42);
    });

    it('should return null when content not found', async () => {
      contentsService.findById.mockResolvedValue(null);

      const result = await controller.findById('999');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create content and return it', async () => {
      const data = { title: '新内容', ageRange: '3-4', domain: 'language' };
      const created = { id: 1, ...data };
      contentsService.create.mockResolvedValue(created);

      const result = await controller.create(data);

      expect(result).toEqual(created);
      expect(contentsService.create).toHaveBeenCalledWith(data);
    });

    it('should pass all fields to service', async () => {
      const data = {
        title: '科学探索',
        ageRange: '5-6',
        domain: 'science',
        type: 'video',
        difficulty: 3,
      };
      contentsService.create.mockResolvedValue({ id: 1, ...data });

      await controller.create(data);

      expect(contentsService.create).toHaveBeenCalledWith(data);
    });
  });
});