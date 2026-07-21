import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  PoetryAnnotationService,
  PoemAnnotation,
} from '../../src/modules/poetry/poetry-annotation.service';
import { PoetryService } from '../../src/modules/poetry/poetry.service';
import { PoemAnnotationRecord } from '../../src/modules/poetry/entities/poem-annotation.entity';

describe('PoetryAnnotationService', () => {
  let service: PoetryAnnotationService;
  let annotationRepo: any;
  let poetryService: any;
  let configService: any;

  const mockRecord: PoemAnnotationRecord = {
    poemId: 1,
    translation: '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
    notes: JSON.stringify([
      { term: '疑', explanation: '好像' },
      { term: '举头', explanation: '抬头' },
    ]),
    appreciation: '表达了诗人对故乡的思念之情。',
    source: 'llm',
    model: 'deepseek-v4-flash',
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
  } as PoemAnnotationRecord;

  const mockAnnotation: PoemAnnotation = {
    poemId: 1,
    translation: '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
    notes: [
      { term: '疑', explanation: '好像' },
      { term: '举头', explanation: '抬头' },
    ],
    appreciation: '表达了诗人对故乡的思念之情。',
    source: 'llm',
  };

  const mockPoem = {
    id: 1,
    title: '静夜思',
    content: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
    type: '五言绝句',
    author: { id: 1, name: '李白' },
    dynasty: { id: 1, name: '唐' },
  };

  beforeEach(async () => {
    annotationRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    poetryService = {
      findById: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: string) => {
        if (key === 'LLM_BASE_URL') return '';
        if (key === 'LLM_API_KEY') return 'unused';
        if (key === 'POETRY_ANNOTATION_MODEL') return 'deepseek-v4-flash';
        return defaultVal ?? null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoetryAnnotationService,
        {
          provide: getRepositoryToken(PoemAnnotationRecord),
          useValue: annotationRepo,
        },
        { provide: PoetryService, useValue: poetryService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PoetryAnnotationService>(PoetryAnnotationService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  getAnnotation — main public method
  // ═══════════════════════════════════════════════════════════════════════
  describe('getAnnotation', () => {
    it('should return cached annotation from DB when available', async () => {
      annotationRepo.findOne.mockResolvedValue(mockRecord);

      const result = await service.getAnnotation(1);

      expect(annotationRepo.findOne).toHaveBeenCalledWith({
        where: { poemId: 1 },
      });
      expect(result).toEqual(mockAnnotation);
    });

    it('should return null when poem not found and no cache', async () => {
      annotationRepo.findOne.mockResolvedValue(null);
      poetryService.findById.mockResolvedValue(null);

      const result = await service.getAnnotation(999);

      expect(result).toBeNull();
    });

    it('should use fallback annotation when no LLM client is available', async () => {
      annotationRepo.findOne.mockResolvedValue(null);
      poetryService.findById.mockResolvedValue(mockPoem);

      const result = await service.getAnnotation(1);

      expect(result).not.toBeNull();
      expect(result!.poemId).toBe(1);
      expect(result!.source).toBe('fallback');
      expect(result!.translation).toBe('（注解服务暂不可用，请稍后再试）');
      expect(result!.notes).toEqual([]);
      expect(result!.appreciation).toBe('');
      expect(annotationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ poemId: 1, source: 'fallback' }),
      );
    });

    it('should skip DB check when refresh=true', async () => {
      annotationRepo.findOne.mockResolvedValue(mockRecord);
      poetryService.findById.mockResolvedValue(mockPoem);

      const result = await service.getAnnotation(1, 'zh-Hans', true);

      // With no LLM client, refresh=true skips DB and goes to fallback
      expect(annotationRepo.findOne).not.toHaveBeenCalled();
      expect(annotationRepo.save).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
      expect(result!.source).toBe('fallback');
    });

    it('should not overwrite existing annotation on LLM failure', async () => {
      const configWithLLM = {
        get: jest.fn().mockImplementation((key: string, defaultVal?: string) => {
          if (key === 'LLM_BASE_URL') return 'http://test.local/v1';
          if (key === 'LLM_API_KEY') return 'test-key';
          if (key === 'POETRY_ANNOTATION_MODEL') return 'deepseek-v4-flash';
          return defaultVal ?? null;
        }),
      };

      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          PoetryAnnotationService,
          {
            provide: getRepositoryToken(PoemAnnotationRecord),
            useValue: annotationRepo,
          },
          { provide: PoetryService, useValue: poetryService },
          { provide: ConfigService, useValue: configWithLLM },
        ],
      }).compile();

      const service2 = module2.get<PoetryAnnotationService>(PoetryAnnotationService);
      (service2 as any).fastClient = {
        chat: { completions: { create: jest.fn().mockRejectedValue(new Error('API error')) } },
      };

      annotationRepo.findOne.mockResolvedValue(mockRecord);
      poetryService.findById.mockResolvedValue(mockPoem);

      const result = await service2.getAnnotation(1, 'zh-Hans', true);

      expect(result).toEqual(mockAnnotation);
      expect(annotationRepo.save).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  recordToAnnotation — DB → API shape converter
  // ═══════════════════════════════════════════════════════════════════════
  describe('recordToAnnotation', () => {
    it('should parse valid JSON notes into an array', () => {
      const record: PoemAnnotationRecord = {
        poemId: 42,
        translation: 'test translation',
        notes: '[{"term":"a","explanation":"b"},{"term":"c","explanation":"d"}]',
        appreciation: 'appreciation text',
        source: 'llm',
        model: 'test-model',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PoemAnnotationRecord;

      const result = (service as any).recordToAnnotation(record) as PoemAnnotation;

      expect(result).toEqual({
        poemId: 42,
        translation: 'test translation',
        notes: [
          { term: 'a', explanation: 'b' },
          { term: 'c', explanation: 'd' },
        ],
        appreciation: 'appreciation text',
        source: 'llm',
      });
    });

    it('should return empty notes array when JSON is malformed', () => {
      const record: PoemAnnotationRecord = {
        poemId: 42,
        translation: 'test',
        notes: '{broken json!!!',
        appreciation: 'appreciation',
        source: 'fallback',
        model: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PoemAnnotationRecord;

      const result = (service as any).recordToAnnotation(record) as PoemAnnotation;

      expect(result.notes).toEqual([]);
      expect(result.poemId).toBe(42);
      expect(result.translation).toBe('test');
      expect(result.appreciation).toBe('appreciation');
      expect(result.source).toBe('fallback');
    });

    it('should return empty notes array when notes string is empty', () => {
      const record: PoemAnnotationRecord = {
        poemId: 99,
        translation: 't',
        notes: '',
        appreciation: 'a',
        source: 'llm',
        model: 'm',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PoemAnnotationRecord;

      const result = (service as any).recordToAnnotation(record) as PoemAnnotation;

      expect(result.notes).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  extractJson — LLM response sanitiser
  // ═══════════════════════════════════════════════════════════════════════
  describe('extractJson', () => {
    it('should return plain JSON as-is', () => {
      const input = '{"translation":"hi","notes":[],"appreciation":"good"}';
      expect((service as any).extractJson(input)).toBe(input);
    });

    it('should extract JSON from ```json fenced code block', () => {
      const input = '```json\n{"translation":"hello","notes":[],"appreciation":"nice"}\n```';
      expect((service as any).extractJson(input)).toBe(
        '{"translation":"hello","notes":[],"appreciation":"nice"}',
      );
    });

    it('should extract JSON from ``` code block without language tag', () => {
      const input = '```\n{"translation":"hello","notes":[],"appreciation":"nice"}\n```';
      expect((service as any).extractJson(input)).toBe(
        '{"translation":"hello","notes":[],"appreciation":"nice"}',
      );
    });

    it('should strip leading prose noise before JSON', () => {
      const input =
        'Here is the annotation:\n{"translation":"hello","notes":[],"appreciation":"nice"}';
      expect((service as any).extractJson(input)).toBe(
        '{"translation":"hello","notes":[],"appreciation":"nice"}',
      );
    });

    it('should strip trailing noise after JSON', () => {
      const input = '{"translation":"hello","notes":[],"appreciation":"nice"}\nI hope this helps!';
      expect((service as any).extractJson(input)).toBe(
        '{"translation":"hello","notes":[],"appreciation":"nice"}',
      );
    });

    it('should handle leading and trailing newlines gracefully', () => {
      const input = '\n\n{"translation":"hello","notes":[],"appreciation":"nice"}\n\n';
      expect((service as any).extractJson(input)).toBe(
        '{"translation":"hello","notes":[],"appreciation":"nice"}',
      );
    });

    it('should return {} for empty string input', () => {
      expect((service as any).extractJson('')).toBe('{}');
    });

    it('should return {} for null/undefined input', () => {
      expect((service as any).extractJson(null as unknown as string)).toBe('{}');
      expect((service as any).extractJson(undefined as unknown as string)).toBe('{}');
    });

    it('should return {} when no JSON object found', () => {
      expect((service as any).extractJson('no json here whatsoever')).toBe('{}');
      expect((service as any).extractJson('just some random text')).toBe('{}');
    });

    it('should handle fenced code block with extra whitespace', () => {
      const input =
        '  ```json  \n{"translation":"hello","notes":[],"appreciation":"nice"}\n  ```  ';
      expect((service as any).extractJson(input)).toBe(
        '{"translation":"hello","notes":[],"appreciation":"nice"}',
      );
    });

    it('should handle nested braces in content', () => {
      const input =
        '{"translation":"a{b}c","notes":[{"term":"x","explanation":"y"}],"appreciation":"z"}';
      expect((service as any).extractJson(input)).toBe(input);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  buildFallback — placeholder when LLM unavailable
  // ═══════════════════════════════════════════════════════════════════════
  describe('buildFallback', () => {
    it('should return a fallback annotation with placeholder text', () => {
      const poem = {
        title: '静夜思',
        content: '床前明月光',
        author: { name: '李白' },
        dynasty: { name: '唐' },
      };

      const result = (service as any).buildFallback(456, poem) as PoemAnnotation;

      expect(result).toEqual({
        poemId: 456,
        translation: '（注解服务暂不可用，请稍后再试）',
        notes: [],
        appreciation: '',
        source: 'fallback',
      });
    });

    it('should handle poem with null author and dynasty', () => {
      const poem = {
        title: '无名诗',
        content: '一二三四五',
        author: null,
        dynasty: null,
      };

      const result = (service as any).buildFallback(456, poem) as PoemAnnotation;

      expect(result.poemId).toBe(456);
      expect(result.notes).toEqual([]);
      expect(result.appreciation).toBe('');
      expect(result.translation).toBe('（注解服务暂不可用，请稍后再试）');
      expect(result.source).toBe('fallback');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Lang parameter passthrough
  // ═══════════════════════════════════════════════════════════════════════
  describe('lang parameter', () => {
    it('should pass lang to poetryService.findById', async () => {
      annotationRepo.findOne.mockResolvedValue(null);
      poetryService.findById.mockResolvedValue(mockPoem);

      await service.getAnnotation(1, 'zh-Hant');

      expect(poetryService.findById).toHaveBeenCalledWith(1, 'zh-Hant');
    });
  });
});
