import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PoetryAnnotationService } from '../../src/modules/poetry/poetry-annotation.service';
import { PoemAnnotationRecord } from '../../src/modules/poetry/entities/poem-annotation.entity';
import { PoetryService } from '../../src/modules/poetry/poetry.service';
import { LlmClientService } from '../../src/agent-framework/llm/llm-client.service';

describe('PoetryAnnotationService', () => {
  let service: PoetryAnnotationService;
  let mockAnnotationRepo: any;
  let mockPoetryService: any;
  let mockConfigService: any;
  let mockLlmClient: any;

  const mockPoem = {
    id: 1,
    title: '静夜思',
    content: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
    type: '五言绝句',
    author: { id: 1, name: '李白' },
    dynasty: { id: 1, name: '唐' },
  };

  const mockAnnotationRecord: PoemAnnotationRecord = {
    poemId: 1,
    translation: '床前洒满明亮的月光，好像地上铺了一层白霜。',
    notes: JSON.stringify([
      { term: '明月光', explanation: '明亮的月光' },
      { term: '思故乡', explanation: '思念家乡' },
    ]),
    appreciation: '这首诗表达了诗人对故乡的深深思念之情。',
    source: 'llm',
    model: 'deepseek-v4-flash',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLlmAnnotation = {
    translation: '床前洒满明亮的月光，好像地上铺了一层白霜。',
    notes: [
      { term: '明月光', explanation: '明亮的月光' },
      { term: '思故乡', explanation: '思念家乡' },
    ],
    appreciation: '这首诗表达了诗人对故乡的深深思念之情。',
  };

  /**
   * Helper: create module with optional LlmClientService
   */
  async function createModule(includeLlmClient = true): Promise<TestingModule> {
    const providers: any[] = [
      PoetryAnnotationService,
      { provide: getRepositoryToken(PoemAnnotationRecord), useValue: mockAnnotationRepo },
      { provide: PoetryService, useValue: mockPoetryService },
      { provide: ConfigService, useValue: mockConfigService },
    ];
    if (includeLlmClient) {
      providers.push({ provide: LlmClientService, useValue: mockLlmClient });
    }
    const module = await Test.createTestingModule({ providers }).compile();
    await module.init();
    return module;
  }

  beforeEach(() => {
    mockAnnotationRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockPoetryService = {
      findById: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          LLM_BASE_URL: '',
          LLM_API_KEY: 'unused',
          POETRY_ANNOTATION_MODEL: 'deepseek-v4-flash',
        };
        return key in configMap ? configMap[key] : defaultValue;
      }),
    };

    mockLlmClient = {
      isConfigured: true,
      generate: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should not create fastClient when LLM_BASE_URL is empty', async () => {
      const module = await createModule();
      service = module.get<PoetryAnnotationService>(PoetryAnnotationService);
      expect(service).toBeDefined();
    });
  });

  describe('getAnnotation', () => {
    beforeEach(async () => {
      const module = await createModule(true);
      service = module.get<PoetryAnnotationService>(PoetryAnnotationService);
    });

    it('should return cached annotation on DB hit (no LLM call)', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(mockAnnotationRecord);

      const result = await service.getAnnotation(1);

      expect(mockAnnotationRepo.findOne).toHaveBeenCalledWith({ where: { poemId: 1 } });
      expect(mockPoetryService.findById).not.toHaveBeenCalled();
      expect(mockLlmClient.generate).not.toHaveBeenCalled();
      expect(result).toEqual({
        poemId: 1,
        translation: '床前洒满明亮的月光，好像地上铺了一层白霜。',
        notes: [
          { term: '明月光', explanation: '明亮的月光' },
          { term: '思故乡', explanation: '思念家乡' },
        ],
        appreciation: '这首诗表达了诗人对故乡的深深思念之情。',
        source: 'llm',
      });
    });

    it('should call LLM on DB miss and save annotation', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue(JSON.stringify(mockLlmAnnotation));

      const result = await service.getAnnotation(1);

      expect(mockPoetryService.findById).toHaveBeenCalledWith(1, 'zh-Hans');
      expect(mockLlmClient.generate).toHaveBeenCalled();
      expect(mockAnnotationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          poemId: 1,
          translation: '床前洒满明亮的月光，好像地上铺了一层白霜。',
          source: 'llm',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          poemId: 1,
          translation: '床前洒满明亮的月光，好像地上铺了一层白霜。',
          source: 'llm',
        }),
      );
    });

    it('should re-generate via LLM when refresh=true even if DB has data', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(mockAnnotationRecord);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue(
        JSON.stringify({
          translation: '刷新后的翻译',
          notes: [],
          appreciation: '刷新后的赏析',
        }),
      );

      const result = await service.getAnnotation(1, 'zh-Hans', true);

      // Should NOT call findOne for cache check (refresh=true skips it)
      expect(mockPoetryService.findById).toHaveBeenCalled();
      expect(mockLlmClient.generate).toHaveBeenCalled();
      expect(mockAnnotationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ translation: '刷新后的翻译' }),
      );
      expect(result.translation).toBe('刷新后的翻译');
    });

    it('should fall back to buildFallback when no LLM client available', async () => {
      const module = await createModule(false);
      service = module.get<PoetryAnnotationService>(PoetryAnnotationService);
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);

      const result = await service.getAnnotation(1);

      expect(mockAnnotationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          poemId: 1,
          translation: '（注解服务暂不可用，请稍后再试）',
          source: 'fallback',
        }),
      );
      expect(result).toEqual({
        poemId: 1,
        translation: '（注解服务暂不可用，请稍后再试）',
        notes: [],
        appreciation: '',
        source: 'fallback',
      });
    });

    it('should return null when poem not found', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(null);

      const result = await service.getAnnotation(999);

      expect(result).toBeNull();
      expect(mockLlmClient.generate).not.toHaveBeenCalled();
      expect(mockAnnotationRepo.save).not.toHaveBeenCalled();
    });

    it('should use fallback on LLM failure and return existing annotation', async () => {
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockRejectedValue(new Error('LLM API error'));
      mockAnnotationRepo.findOne.mockResolvedValue(mockAnnotationRecord);

      const result = await service.getAnnotation(1, 'zh-Hans', true);

      expect(result.translation).toBe('床前洒满明亮的月光，好像地上铺了一层白霜。');
      expect(result.source).toBe('llm');
      expect(mockAnnotationRepo.save).not.toHaveBeenCalled();
    });

    it('should save fallback when LLM fails and no existing annotation', async () => {
      mockAnnotationRepo.findOne
        .mockResolvedValueOnce(null) // cache check (refresh=true, so this won't fire)
        .mockResolvedValueOnce(null); // catch block: no existing annotation
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockRejectedValue(new Error('LLM timeout'));

      const result = await service.getAnnotation(1, 'zh-Hans', true);

      expect(result.source).toBe('fallback');
      expect(result.translation).toBe('（注解服务暂不可用，请稍后再试）');
      expect(mockAnnotationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'fallback' }),
      );
    });

    it('should pass correct lang parameter to poetryService.findById', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue(JSON.stringify(mockLlmAnnotation));

      await service.getAnnotation(1, 'zh-Hant');

      expect(mockPoetryService.findById).toHaveBeenCalledWith(1, 'zh-Hant');
    });

    it('should handle LLM response with markdown code block (extractJson)', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue(
        '```json\n{"translation":"测试翻译","notes":[],"appreciation":"test"}\n```',
      );

      const result = await service.getAnnotation(1);

      expect(result.translation).toBe('测试翻译');
    });

    it('should handle LLM response with leading/trailing noise (extractJson)', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue(
        '下面是诗词注解：\n{"translation":"测试翻译","notes":[],"appreciation":"test"}\n（以上是注解）',
      );

      const result = await service.getAnnotation(1);

      expect(result.translation).toBe('测试翻译');
    });

    it('should handle empty LLM response gracefully (extractJson)', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue('');

      const result = await service.getAnnotation(1);

      expect(result).toBeDefined();
      expect(result.translation).toBe('');
      expect(result.notes).toEqual([]);
      expect(result.appreciation).toBe('');
      expect(result.source).toBe('llm');
    });

    it('should handle JSON with no opening brace (extractJson)', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue('no json here');

      const result = await service.getAnnotation(1);

      expect(result).toBeDefined();
      expect(result.translation).toBe('');
    });

    it('should handle valid JSON notes from DB record (recordToAnnotation)', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(mockAnnotationRecord);

      const result = await service.getAnnotation(1);

      expect(result.notes).toEqual([
        { term: '明月光', explanation: '明亮的月光' },
        { term: '思故乡', explanation: '思念家乡' },
      ]);
    });

    it('should handle malformed JSON notes gracefully (recordToAnnotation)', async () => {
      const badRecord = {
        ...mockAnnotationRecord,
        notes: 'not-valid-json{broken',
      };
      mockAnnotationRepo.findOne.mockResolvedValue(badRecord);

      const result = await service.getAnnotation(1);

      expect(result.notes).toEqual([]);
      expect(result.translation).toBe('床前洒满明亮的月光，好像地上铺了一层白霜。');
      expect(result.appreciation).toBe('这首诗表达了诗人对故乡的深深思念之情。');
    });

    it('should handle empty notes string', async () => {
      const emptyNotesRecord = {
        ...mockAnnotationRecord,
        notes: '',
      };
      mockAnnotationRepo.findOne.mockResolvedValue(emptyNotesRecord);

      const result = await service.getAnnotation(1);

      expect(result.notes).toEqual([]);
    });

    it('should filter out empty notes and limit to 5', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);
      mockLlmClient.generate.mockResolvedValue(
        JSON.stringify({
          translation: 'test',
          notes: [
            { term: 'a', explanation: 'aa' },
            { term: '', explanation: 'bb' },
            { term: 'c', explanation: '' },
            { term: 'd', explanation: 'dd' },
            { term: 'e', explanation: 'ee' },
            { term: 'f', explanation: 'ff' },
            { term: 'g', explanation: 'gg' },
          ],
          appreciation: 'test',
        }),
      );

      const result = await service.getAnnotation(1);

      expect(result.notes.length).toBeLessThanOrEqual(5);
      expect(result.notes.every((n) => n.term && n.explanation)).toBe(true);
    });
  });

  describe('buildFallback (no LLM clients)', () => {
    beforeEach(async () => {
      const module = await createModule(false);
      service = module.get<PoetryAnnotationService>(PoetryAnnotationService);
    });

    it('should return correct placeholder structure', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);

      const result = await service.getAnnotation(1);

      expect(result).toEqual({
        poemId: 1,
        translation: '（注解服务暂不可用，请稍后再试）',
        notes: [],
        appreciation: '',
        source: 'fallback',
      });
    });

    it('should save fallback to DB', async () => {
      mockAnnotationRepo.findOne.mockResolvedValue(null);
      mockPoetryService.findById.mockResolvedValue(mockPoem);

      await service.getAnnotation(1);

      expect(mockAnnotationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          poemId: 1,
          source: 'fallback',
          model: 'global',
        }),
      );
    });
  });
});
