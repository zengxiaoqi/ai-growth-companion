import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BentoService } from '../../src/modules/bento/bento.service';
import { BentoFileGenerator } from '../../src/modules/bento/generators/bento-file.generator';
import { BentoJsonGenerator } from '../../src/modules/bento/generators/bento-json.generator';
import { ReportWeeklyTemplate } from '../../src/modules/bento/templates/report-weekly';
import { ReportMonthlyTemplate } from '../../src/modules/bento/templates/report-monthly';
import { PoetryTemplate } from '../../src/modules/bento/templates/poetry';
import { LessonPackTemplate } from '../../src/modules/bento/templates/lesson-pack';
import { AchievementTemplate } from '../../src/modules/bento/templates/achievement';
import { SemesterReportTemplate } from '../../src/modules/bento/templates/semester-report';

// Build the fs.promises mock object INSIDE the jest.mock factory so it works around
// JS hoisting / TDZ issues.  A shared registry lets tests reach individual mocks.
const __FSD_C = {} as Record<string, jest.Mock>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock('fs', () => {
  // Create fresh jest.fn() instances here — no TDZ problems.
  const mocks: Record<string, jest.Mock> = {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    readdir: jest.fn(),
  };
  Object.assign(__FSD_C, mocks);

  return {
    __esModule: true,
    default: {},
    promises: mocks,
    /* eslint-disable @typescript-eslint/no-var-requires */
    constants: require('fs').constants,
    createReadStream: require('fs').createReadStream,
    createWriteStream: require('fs').createWriteStream,
    existsSync: require('fs').existsSync,
    readFileSync: require('fs').readFileSync,
    writeFileSync: require('fs').writeFileSync,
    appendFileSync: require('fs').appendFileSync,
    copyFileSync: require('fs').copyFileSync,
    truncateSync: require('fs').truncateSync,
    mkdirSync: require('fs').mkdirSync,
    rmSync: require('fs').rmSync,
    rmdirSync: require('fs').rmdirSync,
    renameSync: require('fs').renameSync,
    realpathSync: require('fs').realpathSync,
    readdirSync: require('fs').readdirSync,
    readlinkSync: require('fs').readlinkSync,
    chmodSync: require('fs').chmodSync,
    chownSync: require('fs').chownSync,
    lchmodSync: require('fs').lchmodSync,
    lchownSync: require('fs').lchownSync,
    closeSync: require('fs').closeSync,
    fchownSync: require('fs').fchownSync,
    fdatasyncSync: require('fs').fdatasyncSync,
    fstatSync: require('fs').fstatSync,
    fsyncSync: require('fs').fsyncSync,
    ftruncateSync: require('fs').ftruncateSync,
    futimesSync: require('fs').futimesSync,
    linkSync: require('fs').linkSync,
    lutimesSync: require('fs').lutimesSync,
    opendirSync: require('fs').opendirSync,
    statSync: require('fs').statSync,
    symlinkSync: require('fs').symlinkSync,
    unlinkSync: require('fs').unlinkSync,
    unwatchFile: require('fs').unwatchFile,
    utimesSync: require('fs').utimesSync,
    watch: require('fs').watch,
    watchFile: require('fs').watchFile,
    writeSync: require('fs').writeSync,
    /* eslint-enable @typescript-eslint/no-var-requires */
  };
});

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-12345678') }));
jest.useFakeTimers();

// Convenience references populated after jest.mock factory runs.
const pMkdir = __FSD_C.mkdir as jest.Mock;
const pReadFile = __FSD_C.readFile as jest.Mock;
const pWriteFile = __FSD_C.writeFile as jest.Mock;
const pAccess = __FSD_C.access as jest.Mock;
const pStat = __FSD_C.stat as jest.Mock;
const pUnlink = __FSD_C.unlink as jest.Mock;
const pReaddir = __FSD_C.readdir as jest.Mock;

let bentoService: BentoService;
let mockBentoFileGenerator: { generate: jest.Mock };
let mockBentoJsonGenerator: { assemble: jest.Mock };

// Template mocks stored at module scope
let mockWeeklyTemplate: any;
let mockMonthlyTemplate: any;
let mockPoetryTemplate: any;
let mockLessonPackTemplate: any;
let mockAchievementTemplate: any;
let mockSemesterReportTemplate: any;

const makeTemplateMock = () => ({
  toSlides: jest
    .fn()
    .mockReturnValue([
      { id: 'slide1', background: '#fff', transition: 'none' as const, elements: [], notes: '' },
    ]),
  defaultTheme: jest.fn().mockReturnValue({
    background: '#fff',
    color: '#333',
    accent: '#3498DB',
    fontFamily: 'sans-serif',
  }),
});

beforeEach(async () => {
  mockWeeklyTemplate = makeTemplateMock();
  mockMonthlyTemplate = makeTemplateMock();
  mockPoetryTemplate = makeTemplateMock();
  mockLessonPackTemplate = makeTemplateMock();
  mockAchievementTemplate = makeTemplateMock();
  mockSemesterReportTemplate = makeTemplateMock();

  mockBentoFileGenerator = {
    generate: jest.fn().mockResolvedValue('/tmp/bento-output/test-file.bento.html'),
  };

  mockBentoJsonGenerator = {
    assemble: jest.fn().mockReturnValue({
      format: 'bento/slides',
      version: 1,
      docId: 'mock-uuid-12345678',
      title: 'test',
      size: { width: 1280, height: 720 },
      theme: {},
      slides: [],
      modified: '2026-01-01T00:00:00.000Z',
    }),
  };

  // Default state
  pAccess.mockResolvedValue(undefined);
  pReaddir.mockResolvedValue([]);
  pMkdir.mockResolvedValue(undefined);
  pReadFile.mockRejectedValue(new Error('ENOENT'));
  pStat.mockResolvedValue({ mtimeMs: Date.now() } as any);
  pUnlink.mockResolvedValue(undefined);
  pWriteFile.mockResolvedValue(undefined);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BentoService,
      { provide: BentoFileGenerator, useValue: mockBentoFileGenerator },
      { provide: BentoJsonGenerator, useValue: mockBentoJsonGenerator },
      { provide: ReportWeeklyTemplate, useValue: mockWeeklyTemplate },
      { provide: ReportMonthlyTemplate, useValue: mockMonthlyTemplate },
      { provide: PoetryTemplate, useValue: mockPoetryTemplate },
      { provide: LessonPackTemplate, useValue: mockLessonPackTemplate },
      { provide: AchievementTemplate, useValue: mockAchievementTemplate },
      { provide: SemesterReportTemplate, useValue: mockSemesterReportTemplate },
    ],
  }).compile();

  bentoService = module.get<BentoService>(BentoService);

  jest.clearAllMocks();
});

afterEach(() => {
  if ((bentoService as any).cleanupInterval) {
    clearInterval((bentoService as any).cleanupInterval);
    (bentoService as any).cleanupInterval = null;
  }
});

// ── Helpers ──
const getFileRegistry = (): Map<string, any> => (bentoService as any).fileRegistry;
const getCacheIndex = (): Map<string, any> => (bentoService as any).cacheIndex;

// ─────────── generateReport ───────────

describe('generateReport', () => {
  const reportData = {
    childName: '小明',
    period: 'weekly',
    startDate: '2026-01-01',
    endDate: '2026-01-07',
    totalLearningTime: 3600,
    totalLessonsCompleted: 10,
    averageScore: 85,
    dailyStats: [],
    skillProgress: { language: 80, math: 70 },
    achievements: [],
    insights: ['Good progress'],
    streak: 3,
    encouragement: 'Keep going!',
  };

  it('should generate a new weekly report when not cached', async () => {
    const fileId = await bentoService.generateReport(1, 'weekly', reportData);

    expect(fileId).toBe('mock-uuid-12345678');
    expect(mockWeeklyTemplate.defaultTheme).toHaveBeenCalled();
    expect(mockWeeklyTemplate.toSlides).toHaveBeenCalledWith(reportData, expect.any(Object));
    expect(mockBentoJsonGenerator.assemble).toHaveBeenCalled();
    expect(mockBentoFileGenerator.generate).toHaveBeenCalled();
    // persistIndex → 1 writeFile call
    expect(pWriteFile).toHaveBeenCalledTimes(1);
    expect(getCacheIndex().size).toBe(1);
  });

  it('should generate monthly report using monthly template', async () => {
    const monthlyData = {
      ...reportData,
      weekSummaries: [],
      trendHistory: [],
      monthlyHighlight: 'Great!',
    };
    await bentoService.generateReport(1, 'monthly', monthlyData as any);

    expect(mockMonthlyTemplate.defaultTheme).toHaveBeenCalled();
    expect(mockWeeklyTemplate.defaultTheme).not.toHaveBeenCalled();
    expect(mockMonthlyTemplate.toSlides).toHaveBeenCalled();
  });

  it('should return cached fileId when cache hit and file exists on disk', async () => {
    const result1 = await bentoService.generateReport(1, 'weekly', reportData);
    expect(result1).toBe('mock-uuid-12345678');

    const result2 = await bentoService.generateReport(1, 'weekly', reportData);

    expect(result2).toBe(result1);
    expect(mockBentoFileGenerator.generate).toHaveBeenCalledTimes(1);
  });

  it('should fall back to plain HTML when generation throws', async () => {
    mockBentoFileGenerator.generate.mockRejectedValueOnce(new Error('template error'));

    const fileId = await bentoService.generateReport(1, 'weekly', reportData);

    expect(fileId).toBe('mock-uuid-12345678');
    // persistIndex + fallback html = 2 writes
    expect(pWriteFile).toHaveBeenCalledTimes(2);
  });

  it('should register file even on fallback', async () => {
    mockBentoFileGenerator.generate.mockRejectedValueOnce(new Error('fail'));
    const fileId = await bentoService.generateReport(1, 'weekly', reportData);

    expect(getFileRegistry().has(fileId)).toBe(true);
  });
});

// ─────────── generatePoetrySlide ───────────

describe('generatePoetrySlide', () => {
  const poetryData = {
    poemId: 1,
    title: '静夜思',
    author: '李白',
    dynasty: '唐',
    type: '五绝',
    lines: ['床前明月光', '疑是地上霜'],
    translation: 'Bright moonlight before my bed',
    notes: [{ term: '明月', explanation: 'bright moon' }],
    appreciation: 'A classic of longing.',
  };

  it('should generate a new poetry slide when not cached', async () => {
    const fileId = await bentoService.generatePoetrySlide(poetryData);

    expect(fileId).toBe('mock-uuid-12345678');
    expect(mockPoetryTemplate.defaultTheme).toHaveBeenCalled();
    expect(mockPoetryTemplate.toSlides).toHaveBeenCalledWith(poetryData, expect.any(Object));
    expect(mockBentoJsonGenerator.assemble).toHaveBeenCalled();
    expect(mockBentoFileGenerator.generate).toHaveBeenCalled();
  });

  it('should use correct title and meta in assemble', async () => {
    await bentoService.generatePoetrySlide(poetryData);

    const assembleCall = mockBentoJsonGenerator.assemble.mock.calls[0];
    expect(assembleCall[1]).toContain('静夜思');
    expect(assembleCall[1]).toContain('李白');
    expect(assembleCall[4]).toEqual({
      readonly: true,
      meta: { author: '李白', subject: '诗词鉴赏' },
    });
  });

  it('should return cached fileId on cache hit', async () => {
    const result1 = await bentoService.generatePoetrySlide(poetryData);
    const result2 = await bentoService.generatePoetrySlide(poetryData);
    expect(result2).toBe(result1);
    expect(mockBentoFileGenerator.generate).toHaveBeenCalledTimes(1);
  });
});

// ─────────── generateContentSlide ───────────

describe('generateContentSlide', () => {
  const contentData = {
    title: '认识数字1',
    subtitle: '学前班',
    ageRange: '3-4岁',
    domain: '数学',
    sections: [
      { type: 'text' as const, content: '数字1像铅笔细又长' },
      { type: 'quiz' as const, content: '哪个是数字1？' },
    ],
    summary: '掌握数字1的形态',
  };

  it('should generate a new lesson slide when not cached', async () => {
    const fileId = await bentoService.generateContentSlide(contentData);

    expect(fileId).toBe('mock-uuid-12345678');
    expect(mockLessonPackTemplate.defaultTheme).toHaveBeenCalled();
    expect(mockLessonPackTemplate.toSlides).toHaveBeenCalledWith(contentData, expect.any(Object));
    expect(mockBentoJsonGenerator.assemble).toHaveBeenCalledWith(
      'mock-uuid-12345678',
      contentData.title,
      expect.any(Array),
      expect.any(Object),
      { readonly: true },
    );
  });

  it('should return cached fileId on cache hit', async () => {
    const result1 = await bentoService.generateContentSlide(contentData);
    const result2 = await bentoService.generateContentSlide(contentData);
    expect(result2).toBe(result1);
    expect(mockBentoFileGenerator.generate).toHaveBeenCalledTimes(1);
  });
});

// ─────────── generateAchievementSlide ───────────

describe('generateAchievementSlide', () => {
  const achievementData = {
    childName: '小红',
    achievements: [
      {
        id: 1,
        name: '阅读达人',
        description: '连续阅读7天',
        category: 'learning',
        tier: 'gold',
        unlocked: true,
        unlockedAt: '2026-01-01T00:00:00.000Z',
        progress: 7,
        totalRequired: 7,
      },
    ],
  };

  it('should generate a new achievement slide without custom options', async () => {
    const fileId = await bentoService.generateAchievementSlide(achievementData);

    expect(fileId).toBe('mock-uuid-12345678');
    expect(mockAchievementTemplate.toSlides).toHaveBeenCalledWith(
      achievementData,
      expect.any(Object),
    );
  });

  it('should apply custom theme options to the generated slide', async () => {
    await bentoService.generateAchievementSlide(achievementData, {
      accentColor: '#E74C3C',
      backgroundColor: '#FFFDE7',
      fontFamily: '"Noto Sans SC"',
    });

    const themeArg = mockAchievementTemplate.toSlides.mock.calls[0][1];
    expect(themeArg.accent).toBe('#E74C3C');
    expect(themeArg.background).toBe('#FFFDE7');
    expect(themeArg.fontFamily).toBe('"Noto Sans SC"');
  });

  it('should return cached fileId on cache hit', async () => {
    const result1 = await bentoService.generateAchievementSlide(achievementData);
    const result2 = await bentoService.generateAchievementSlide(achievementData);
    expect(result2).toBe(result1);
  });

  it('should include meta in assemble call', async () => {
    await bentoService.generateAchievementSlide(achievementData);
    const assembleCall = mockBentoJsonGenerator.assemble.mock.calls[0];
    expect(assembleCall[4]).toEqual({
      readonly: true,
      meta: { subject: '成就展示' },
    });
  });
});

// ─────────── generateSemesterReport ───────────

describe('generateSemesterReport', () => {
  const semesterData = {
    childName: '小明',
    semesterLabel: '2026年春季学期',
    startDate: '2026-02-15',
    endDate: '2026-07-01',
    summary: '本学期表现优秀。',
    monthSummaries: [
      {
        month: '3月',
        totalTime: 7200,
        completedLessons: 20,
        averageScore: 88,
        highlight: '第一次独立完成作业！',
        skills: { language: 85, math: 80 },
      },
    ],
    learnedPoems: [{ title: '静夜思', author: '李白' }],
    learnedLessons: [{ title: '认识数字', domain: '数学' }],
    achievements: [{ name: '全勤宝宝', tier: 'gold', unlockedAt: '2026-03-31T00:00:00.000Z' }],
    totalLearningTime: 43200,
    totalLessonsCompleted: 60,
    averageScore: 87,
    totalDaysStudied: 90,
    skillGrowth: { language: { start: 60, end: 85 } },
  };

  it('should generate a new semester report without custom options', async () => {
    const fileId = await bentoService.generateSemesterReport(semesterData);

    expect(fileId).toBe('mock-uuid-12345678');
    expect(mockSemesterReportTemplate.toSlides).toHaveBeenCalledWith(
      semesterData,
      expect.any(Object),
    );
    expect(mockBentoJsonGenerator.assemble).toHaveBeenCalled();
  });

  it('should apply custom theme options to the generated slide', async () => {
    await bentoService.generateSemesterReport(semesterData, {
      accentColor: '#9B59B6',
      backgroundColor: '#FADBD8',
    });

    const themeArg = mockSemesterReportTemplate.toSlides.mock.calls[0][1];
    expect(themeArg.accent).toBe('#9B59B6');
    expect(themeArg.background).toBe('#FADBD8');
  });

  it('should return cached fileId on cache hit', async () => {
    const result1 = await bentoService.generateSemesterReport(semesterData);
    const result2 = await bentoService.generateSemesterReport(semesterData);
    expect(result2).toBe(result1);
    expect(mockBentoFileGenerator.generate).toHaveBeenCalledTimes(1);
  });

  it('should include meta in assemble call', async () => {
    await bentoService.generateSemesterReport(semesterData);
    const assembleCall = mockBentoJsonGenerator.assemble.mock.calls[0];
    expect(assembleCall[4]).toEqual({
      readonly: true,
      meta: { subject: '学期纪念册' },
    });
  });
});

// ─────────── generateFromTemplate ───────────

describe('generateFromTemplate', () => {
  const slides = [
    {
      id: 's1',
      background: '#FFFFFF',
      transition: 'fade' as const,
      elements: [] as any[],
      notes: '',
    },
  ];
  const theme = {
    background: '#fff',
    color: '#333',
    accent: '#3498DB',
    fontFamily: 'sans-serif',
  };

  it('should generate a generic bento document', async () => {
    const fileId = await bentoService.generateFromTemplate('My Presentation', slides, theme);

    expect(fileId).toBe('mock-uuid-12345678');
    expect(mockBentoJsonGenerator.assemble).toHaveBeenCalledWith(
      'mock-uuid-12345678',
      'My Presentation',
      slides,
      theme,
      { readonly: undefined, meta: undefined },
    );
    expect(mockBentoFileGenerator.generate).toHaveBeenCalled();
  });

  it('should pass through options correctly', async () => {
    await bentoService.generateFromTemplate('With Meta', slides, theme, {
      readonly: false,
      meta: { author: 'Test Author', subject: 'demo' },
    });

    const optionsCall = mockBentoJsonGenerator.assemble.mock.calls[0][4];
    expect(optionsCall.readonly).toBe(false);
    expect(optionsCall.meta).toEqual({ author: 'Test Author', subject: 'demo' });
  });

  it('should register the file in the registry', async () => {
    const fileId = await bentoService.generateFromTemplate('My Doc', slides, theme);
    expect(getFileRegistry().has(fileId)).toBe(true);
    const record = getFileRegistry().get(fileId)!;
    expect(record.fileName).toBe('bento-mock-uuid-12345678.bento.html');
  });
});

// ─────────── getBentoFile ───────────

describe('getBentoFile', () => {
  it('should return file info for an existing file', async () => {
    const reg = getFileRegistry();
    reg.set('my-file-1', {
      fileId: 'my-file-1',
      fileName: 'test-report.bento.html',
      path: '/tmp/bento-output/test-report.bento.html',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await bentoService.getBentoFile('my-file-1');

    expect(result).toEqual({
      path: '/tmp/bento-output/test-report.bento.html',
      name: 'test-report.bento.html',
    });
  });

  it('should throw NotFoundException when file does not exist in registry', async () => {
    await expect(bentoService.getBentoFile('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when file was deleted from disk', async () => {
    pAccess.mockRejectedValueOnce(new Error('ENOENT'));
    const reg = getFileRegistry();
    reg.set('disk-deleted', {
      fileId: 'disk-deleted',
      fileName: 'gone.bento.html',
      path: '/tmp/bento-output/gone.bento.html',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(bentoService.getBentoFile('disk-deleted')).rejects.toThrow(NotFoundException);
    expect(getFileRegistry().has('disk-deleted')).toBe(false);
  });
});

// ─────────── listBentoFiles ───────────

describe('listBentoFiles', () => {
  function seedFiles(n: number) {
    const reg = getFileRegistry();
    for (let i = 0; i < n; i++) {
      const ts = new Date(Date.now() - i * 60000).toISOString();
      reg.set(`file-${i}`, {
        fileId: `file-${i}`,
        fileName: `report-${i}.bento.html`,
        path: `/tmp/bento-output/report-${i}.bento.html`,
        createdAt: ts,
      });
    }
  }

  it('should return all files sorted by createdAt desc', async () => {
    seedFiles(5);
    const result = await bentoService.listBentoFiles(1, 20);

    expect(result.total).toBe(5);
    expect(result.files.length).toBe(5);
    expect(result.files[0].createdAt > result.files[4].createdAt).toBe(true);
  });

  it('should paginate correctly', async () => {
    seedFiles(10);
    const page1 = await bentoService.listBentoFiles(1, 3);
    expect(page1.files.length).toBe(3);
    expect(page1.total).toBe(10);

    const page2 = await bentoService.listBentoFiles(2, 3);
    expect(page2.files.length).toBe(3);
  });

  it('should filter out files deleted from disk', async () => {
    seedFiles(3);
    pAccess.mockImplementation(async (p: string) => {
      if (p.includes('report-1.bento.html')) {
        throw new Error('ENOENT');
      }
      return Promise.resolve(undefined);
    });

    const result = await bentoService.listBentoFiles();
    expect(result.total).toBe(2);
    expect(getFileRegistry().has('file-1')).toBe(false);
  });

  it('should return empty array when no files exist', async () => {
    const result = await bentoService.listBentoFiles();
    expect(result.files).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should use defaults page=1 and limit=20', async () => {
    seedFiles(2);
    await bentoService.listBentoFiles();
    expect(getFileRegistry().size).toBe(2);
  });
});

// ─────────── deleteBentoFile ───────────

describe('deleteBentoFile', () => {
  it('should delete the file from disk, registry, and cache', async () => {
    const reg = getFileRegistry();
    const idx = getCacheIndex();

    reg.set('to-delete', {
      fileId: 'to-delete',
      fileName: 'old-report.bento.html',
      path: '/tmp/bento-output/old-report.bento.html',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    idx.set('some-hash', {
      hash: 'some-hash',
      fileId: 'to-delete',
      template: 'report:weekly',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await bentoService.deleteBentoFile('to-delete');

    expect(pUnlink).toHaveBeenCalledWith('/tmp/bento-output/old-report.bento.html');
    expect(getFileRegistry().has('to-delete')).toBe(false);
    expect(getCacheIndex().has('some-hash')).toBe(false);
    expect(pWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.index.json'),
      expect.any(String),
      'utf-8',
    );
  });

  it('should not throw when unlink fails – just log warning', async () => {
    pUnlink.mockRejectedValueOnce(new Error('permission denied'));
    const reg = getFileRegistry();
    reg.set('locked-file', {
      fileId: 'locked-file',
      fileName: 'locked.bento.html',
      path: '/tmp/bento-output/locked.bento.html',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await bentoService.deleteBentoFile('locked-file');
    expect(getFileRegistry().has('locked-file')).toBe(false);
  });

  it('should throw NotFoundException when file not found', async () => {
    await expect(bentoService.deleteBentoFile('nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ─────────── cleanup ───────────

describe('cleanup', () => {
  it('should remove expired files based on FILE_RETENTION_MS', async () => {
    const now = Date.now();
    const oldFileMtime = now - 8 * 24 * 60 * 60 * 1000;
    const freshFileMtime = now - 1 * 24 * 60 * 60 * 1000;

    pReaddir.mockResolvedValueOnce(['old-report.bento.html', 'fresh-report.bento.html']);

    pStat.mockImplementation(async (p: string) => {
      const isOld = p.includes('old-report');
      return { mtimeMs: isOld ? oldFileMtime : freshFileMtime } as any;
    });

    await bentoService.cleanup();

    expect(pUnlink).toHaveBeenCalledTimes(1);
    expect(pUnlink).toHaveBeenCalledWith(expect.stringContaining('old-report.bento.html'));
  });

  it('should skip index files (.index.json)', async () => {
    pReaddir.mockResolvedValueOnce(['.index.json']);

    await bentoService.cleanup();

    expect(pUnlink).not.toHaveBeenCalled();
    expect(pStat).not.toHaveBeenCalled();
  });

  it('should skip non-bento/.html files', async () => {
    pReaddir.mockResolvedValueOnce(['readme.md', 'notes.txt', 'data.json']);

    await bentoService.cleanup();

    expect(pUnlink).not.toHaveBeenCalled();
  });

  it('should clean up stale registry entries after removing disk files', async () => {
    const reg = getFileRegistry();
    reg.set('stale-1', {
      fileId: 'stale-1',
      fileName: 'gone1.bento.html',
      path: '/tmp/bento-output/gone1.bento.html',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    reg.set('alive-1', {
      fileId: 'alive-1',
      fileName: 'still-here.bento.html',
      path: '/tmp/bento-output/still-here.bento.html',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    pReaddir.mockResolvedValueOnce(['still-here.bento.html', 'gone1.bento.html']);
    pStat.mockResolvedValue({ mtimeMs: Date.now() - 1000 } as any);
    pAccess.mockImplementation(async (p: string) => {
      if (p.includes('gone1')) throw new Error('ENOENT');
      return Promise.resolve(undefined);
    });

    await bentoService.cleanup();

    expect(getFileRegistry().has('stale-1')).toBe(false);
    expect(getFileRegistry().has('alive-1')).toBe(true);
  });

  it('should persist index after cleanup', async () => {
    pReaddir.mockResolvedValueOnce(['expired.bento.html']);
    pStat.mockResolvedValue({ mtimeMs: Date.now() - 10 * 24 * 60 * 60 * 1000 } as any);

    await bentoService.cleanup();

    expect(pWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.index.json'),
      expect.any(String),
      'utf-8',
    );
  });
});

// ─────────── onModuleDestroy ───────────

describe('onModuleDestroy', () => {
  it('should clear the cleanup interval', async () => {
    (bentoService as any).cleanupInterval = {
      ref: jest.fn(),
      unref: jest.fn(),
    } as any;

    const origClearInterval = global.clearInterval;
    const cleared = jest.fn();
    global.clearInterval = cleared as any;

    await bentoService.onModuleDestroy();

    expect(cleared).toHaveBeenCalledTimes(1);
    global.clearInterval = origClearInterval;
  });

  it('should persist the index on destroy', async () => {
    const reg = getFileRegistry();
    reg.set('destroy-me', {
      fileId: 'destroy-me',
      fileName: 'final.bento.html',
      path: '/tmp/bento-output/final.bento.html',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await bentoService.onModuleDestroy();

    expect(pWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.index.json'),
      expect.stringContaining('destroy-me'),
      'utf-8',
    );
  });

  it('should handle null interval gracefully', async () => {
    await expect(bentoService.onModuleDestroy()).resolves.toBeUndefined();
  });
});

// ─────────── Cache invalidation ───────────

describe('cache index integrity', () => {
  it('should remove cache entry when the corresponding file is missing from disk', async () => {
    const reportData = {
      childName: 'Xiao Ming',
      period: 'weekly',
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      totalLearningTime: 100,
      totalLessonsCompleted: 5,
      averageScore: 80,
      dailyStats: [],
      skillProgress: { lang: 80 },
      achievements: [],
      insights: [],
      streak: 1,
      encouragement: '',
    };

    const idx = getCacheIndex();
    const reg = getFileRegistry();
    reg.set('broken-cached', {
      fileId: 'broken-cached',
      fileName: 'cached.bento.html',
      path: '/tmp/bento-output/nonexistent.bento.html',
      createdAt: new Date().toISOString(),
    });
    idx.set('hash-x', {
      hash: 'hash-x',
      fileId: 'broken-cached',
      template: 'report:weekly',
      createdAt: new Date().toISOString(),
    });

    pAccess.mockRejectedValueOnce(new Error('ENOENT'));

    const _fileId = await bentoService.generateReport(1, 'weekly', reportData);

    expect(idx.has('hash-x')).toBe(false);
  });
});
