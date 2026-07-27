import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VideoDownloadService } from '../../src/modules/video-download/video-download.service';

// ---- Module-level mocks ----
// The service uses promisify(execFile), so the mock must accept a callback arg.
let mockExecFileImpl: (...args: any[]) => void = (_cmd, _args, _opts, cb) => {
  if (typeof cb === 'function') cb(null, { stdout: '{}', stderr: '' });
};
jest.mock('child_process', () => ({
  execFile: jest.fn((...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      mockExecFileImpl(args[0], args[1], args.length > 3 ? args[2] : {}, cb);
    }
  }),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockFs = require('fs');

// ---- Helpers for test data ----

type RepoMethods = {
  create?: jest.Mock;
  save?: jest.Mock;
  find?: jest.Mock;
  findOne?: jest.Mock;
  findOneBy?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
};

function createRepo(m: RepoMethods = {}): any {
  return {
    create: m.create ?? jest.fn().mockReturnThis(),
    save: m.save ?? jest.fn().mockResolvedValue(undefined),
    find: m.find ?? jest.fn().mockResolvedValue([]),
    findOne: m.findOne ?? jest.fn().mockResolvedValue(null),
    findOneBy: m.findOneBy ?? jest.fn().mockResolvedValue(null),
    update: m.update ?? jest.fn().mockResolvedValue({ affected: 1 }),
    delete: m.delete ?? jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function makeTask(overrides: Partial<any> = {}): any {
  const base: any = {
    id: 1,
    parentId: 10,
    childId: 20,
    sourceUrl: 'https://www.bilibili.com/video/BV123',
    title: 'Test Video',
    thumbnail: 'https://example.com/thumb.jpg',
    uploader: 'Uploader',
    duration: 120,
    platform: 'bilibili',
    status: 'pending' as const,
    filePath: null,
    fileSize: null,
    errorMessage: '',
    publishedToChild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
  return { ...base, ...overrides };
}

function createService(repo?: any): VideoDownloadService {
  return new VideoDownloadService(repo || ({} as any));
}

/** Make execFile succeed with a metadata JSON string */
function succeedWithExtract(metadata: Record<string, unknown>) {
  mockExecFileImpl = (_cmd, _args, _opts, cb) => {
    cb(null, { stdout: JSON.stringify(metadata), stderr: '' });
  };
}

/** Make execFile fail — used for extractInfo */
function failExtract() {
  mockExecFileImpl = (_cmd, _args, _opts, cb) => {
    cb(new Error('Network error'));
  };
}

/** Make execFile succeed with no stdout (for download steps) */
function succeedDownload() {
  mockExecFileImpl = (_cmd, _args, _opts, cb) => {
    cb(null, { stdout: '', stderr: '' });
  };
}

/** Make execFile fail (for download steps) */
function failDownload() {
  mockExecFileImpl = (_cmd, _args, _opts, cb) => {
    cb(new Error('yt-dlp failed'));
  };
}

// Default: extractInfo succeeds with empty metadata, download also succeeds.
beforeEach(() => {
  jest.clearAllMocks();
  succeedWithExtract({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ====================== extractUrlFromText ======================

describe('extractUrlFromText', () => {
  const repo = createRepo();
  const service = createService(repo);

  it('extracts http URL from plain text', () => {
    expect(service['extractUrlFromText']('check out https://example.com/video')).toBe(
      'https://example.com/video',
    );
  });

  it('extracts https URL from share text', () => {
    const input =
      '7.17 复制打开抖音，看看【xxx的作品】... https://v.douyin.com/wql9Ylpwlz8/ ZzT:/ y@t.rE';
    expect(service['extractUrlFromText'](input)).toBe('https://v.douyin.com/wql9Ylpwlz8/');
  });

  it('returns trimmed text when no URL found', () => {
    expect(service['extractUrlFromText']('just some plain text')).toBe('just some plain text');
  });

  it('handles empty string', () => {
    expect(service['extractUrlFromText']('')).toBe('');
  });

  it('handles URL-only input', () => {
    expect(service['extractUrlFromText']('https://example.com/video')).toBe(
      'https://example.com/video',
    );
  });
});

// ====================== detectPlatform ======================

describe('detectPlatform', () => {
  const repo = createRepo();
  const service = createService(repo);

  type TestCase = [string, string];
  const tests: TestCase[] = [
    ['https://www.douyin.com/video/123', 'douyin'],
    ['https://www.iesdouyin.com/share/video/456', 'douyin'],
    ['https://www.bilibili.com/video/BV123', 'bilibili'],
    ['https://b23.tv/short', 'bilibili'],
    ['https://v.qq.com/x/cover/abc', 'tencent'],
    ['https://tencent.com/video', 'tencent'],
    ['https://www.youtube.com/watch?v=abc', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['https://weibo.com/tv/show/abc', 'weibo'],
    ['https://www.kuaishou.com/abc', 'kuaishou'],
    ['https://www.toutiao.com/abc', 'toutiao'],
    ['https://www.ixigua.com/abc', 'ixigua'],
    ['https://www.xiaohongshu.com/abc', 'xiaohongshu'],
    ['https://www.youku.com/abc', 'youku'],
    ['https://www.iqiyi.com/abc', 'iqiyi'],
    ['https://www.sohu.com/abc', 'sohu'],
    ['https://www.acfun.cn/abc', 'acfun'],
    ['https://acplay.cn/abc', 'acfun'],
    ['https://random.example.com/video', 'unknown'],
  ];
  it.each(tests)('detects platform for %s → %s', (url, expected) => {
    expect(service['detectPlatform'](url)).toBe(expected);
  });
});

// ====================== isDouyinUrl ======================

describe('isDouyinUrl', () => {
  const repo = createRepo();
  const service = createService(repo);

  it('returns true for douyin.com', () => {
    expect(service['isDouyinUrl']('https://www.douyin.com/video/123')).toBe(true);
  });

  it('returns true for v.douyin.com', () => {
    expect(service['isDouyinUrl']('https://v.douyin.com/abc')).toBe(true);
  });

  it('returns true for iesdouyin.com', () => {
    expect(service['isDouyinUrl']('https://www.iesdouyin.com/share/video/456')).toBe(true);
  });

  it('returns false for bilibili', () => {
    expect(service['isDouyinUrl']('https://www.bilibili.com/video/BV123')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(service['isDouyinUrl']('')).toBe(false);
  });
});

// ====================== findById ======================

describe('findById', () => {
  it('returns task when found', async () => {
    const task = makeTask();
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(task) });
    const service = createService(repo);
    const result = await service.findById(1);
    expect(result.id).toBe(1);
    expect(result.title).toBe('Test Video');
  });

  it('throws NotFoundException when not found', async () => {
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = createService(repo);
    await expect(service.findById(999)).rejects.toThrow(NotFoundException);
  });
});

// ====================== findByParent ======================

describe('findByParent', () => {
  it('returns tasks for a parent', async () => {
    const tasks = [makeTask({ id: 2 }), makeTask({ id: 1 })];
    const repo = createRepo({ find: jest.fn().mockResolvedValue(tasks) });
    const service = createService(repo);
    const result = await service.findByParent(10);
    expect(result).toHaveLength(2);
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { parentId: 10 } }));
  });

  it('returns empty array when no tasks', async () => {
    const repo = createRepo({ find: jest.fn().mockResolvedValue([]) });
    const service = createService(repo);
    const result = await service.findByParent(999);
    expect(result).toEqual([]);
  });
});

// ====================== findPublishedForChild ======================

describe('findPublishedForChild', () => {
  it('returns published + completed tasks for a child', async () => {
    const tasks = [makeTask({ id: 1, status: 'completed', publishedToChild: true })];
    const repo = createRepo({ find: jest.fn().mockResolvedValue(tasks) });
    const service = createService(repo);
    const result = await service.findPublishedForChild(20);
    expect(result).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { childId: 20, publishedToChild: true, status: 'completed' },
      }),
    );
  });

  it('returns empty when none published', async () => {
    const repo = createRepo({ find: jest.fn().mockResolvedValue([]) });
    const service = createService(repo);
    const result = await service.findPublishedForChild(20);
    expect(result).toEqual([]);
  });
});

// ====================== togglePublish ======================

describe('togglePublish', () => {
  it('toggles publishedToChild from false to true', async () => {
    const task = makeTask({ publishedToChild: false });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn().mockResolvedValue({ ...task, publishedToChild: true }),
    });
    const service = createService(repo);
    const result = await service.togglePublish(1);
    expect(result.publishedToChild).toBe(true);
  });

  it('toggles publishedToChild from true to false', async () => {
    const task = makeTask({ publishedToChild: true });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn().mockResolvedValue({ ...task, publishedToChild: false }),
    });
    const service = createService(repo);
    const result = await service.togglePublish(1);
    expect(result.publishedToChild).toBe(false);
  });

  it('throws NotFoundException for invalid ID', async () => {
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = createService(repo);
    await expect(service.togglePublish(999)).rejects.toThrow(NotFoundException);
  });
});

// ====================== deleteDownload ======================

describe('deleteDownload', () => {
  it('deletes file and record when file exists', async () => {
    const task = makeTask({ filePath: '/uploads/videos/video_1_123.mp4' });
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    await service.deleteDownload(1);
    expect(mockFs.existsSync).toHaveBeenCalled();
    expect(mockFs.unlinkSync).toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('skips file deletion when filePath is null', async () => {
    const task = makeTask({ filePath: null });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    await service.deleteDownload(1);
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('skips file deletion when file does not exist', async () => {
    const task = makeTask({ filePath: '/uploads/videos/video_1_123.mp4' });
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    await service.deleteDownload(1);
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('throws NotFoundException for invalid ID', async () => {
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = createService(repo);
    await expect(service.deleteDownload(999)).rejects.toThrow(NotFoundException);
  });
});

// ====================== cancelDownload ======================

describe('cancelDownload', () => {
  it('cancels a pending download', async () => {
    const task = makeTask({ status: 'pending' });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    await service.cancelDownload(1);
    expect(repo.update).toHaveBeenCalledWith(1, {
      status: 'failed',
      errorMessage: '用户已取消下载',
    });
  });

  it('cancels a downloading task', async () => {
    const task = makeTask({ status: 'downloading' });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    await service.cancelDownload(1);
    expect(repo.update).toHaveBeenCalledWith(1, {
      status: 'failed',
      errorMessage: '用户已取消下载',
    });
  });

  it('throws error for completed task', async () => {
    const task = makeTask({ status: 'completed' });
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(task) });
    const service = createService(repo);
    await expect(service.cancelDownload(1)).rejects.toThrow('Only pending or downloading');
  });

  it('throws error for failed task', async () => {
    const task = makeTask({ status: 'failed' });
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(task) });
    const service = createService(repo);
    await expect(service.cancelDownload(1)).rejects.toThrow('Only pending or downloading');
  });
});

// ====================== retryDownload ======================

describe('retryDownload', () => {
  it('retries a failed download', async () => {
    const task = makeTask({ status: 'failed', sourceUrl: 'https://www.bilibili.com/video/BV123' });
    const updatedTask = { ...task, status: 'pending', errorMessage: null };
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValueOnce(task).mockResolvedValue(updatedTask), // all subsequent (performDownload + return)
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    succeedDownload();
    const result = await service.retryDownload(1);
    expect(result.status).toBe('pending');
    expect(repo.update).toHaveBeenCalledWith(1, { status: 'pending', errorMessage: null });
  });

  it('throws error when task is not failed', async () => {
    const task = makeTask({ status: 'completed' });
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(task) });
    const service = createService(repo);
    await expect(service.retryDownload(1)).rejects.toThrow('Only failed downloads');
  });
});

// ====================== reDownload ======================

describe('reDownload', () => {
  it('skips re-download when file exists and >10KB', async () => {
    const task = makeTask({ status: 'completed', filePath: '/uploads/videos/test.mp4' });
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    (mockFs.statSync as jest.Mock).mockReturnValue({ size: 20000 });
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(task) });
    const service = createService(repo);
    const result = await service.reDownload(1);
    expect(result).toBe(task);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('re-downloads when file does not exist', async () => {
    const task = makeTask({ status: 'completed', filePath: '/uploads/videos/test.mp4' });
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    succeedDownload();
    await service.reDownload(1);
    expect(repo.update).toHaveBeenCalledWith(1, {
      status: 'pending',
      filePath: null,
      fileSize: null,
      errorMessage: null,
    });
  });

  it('re-downloads when file is too small (<=10KB)', async () => {
    const task = makeTask({ status: 'completed', filePath: '/uploads/videos/test.mp4' });
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    (mockFs.statSync as jest.Mock).mockReturnValue({ size: 5000 });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    succeedDownload();
    await service.reDownload(1);
    expect(repo.update).toHaveBeenCalled();
  });
});

// ====================== updateUrl ======================

describe('updateUrl', () => {
  it('updates URL on a failed download and restarts download', async () => {
    const oldTask = makeTask({
      id: 1,
      status: 'failed',
      sourceUrl: 'https://old-url.example.com/video',
      title: 'Old Title',
    });
    const updatedTask = {
      ...oldTask,
      status: 'pending',
      sourceUrl: 'https://new-bilibili.com/video/BV456',
      title: 'New Title',
    };
    succeedWithExtract({
      title: 'New Title',
      thumbnail: 'https://new-thumb.com/thumb.jpg',
      uploader: 'New Uploader',
      duration: 200,
      platform: 'bilibili',
    });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValueOnce(oldTask).mockResolvedValue(updatedTask), // all subsequent (performDownload + return)
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    const result = await service.updateUrl(1, 'https://new-bilibili.com/video/BV456');
    expect(repo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        sourceUrl: 'https://new-bilibili.com/video/BV456',
        title: 'New Title',
        status: 'pending',
      }),
    );
    expect(result.status).toBe('pending');
  });

  it('throws BadRequestException when task is not failed', async () => {
    const task = makeTask({ status: 'completed' });
    const repo = createRepo({ findOne: jest.fn().mockResolvedValue(task) });
    const service = createService(repo);
    await expect(service.updateUrl(1, 'https://new-url.com/video')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for invalid URL', async () => {
    const task = makeTask({ status: 'failed' });
    const repo = createRepo({
      findOne: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const service = createService(repo);
    await expect(service.updateUrl(1, 'not a url')).rejects.toThrow('请输入有效的视频链接');
  });
});

// ====================== createDownload ======================

describe('createDownload', () => {
  it('creates a download task for a Bilibili URL', async () => {
    succeedWithExtract({
      title: 'Bilibili Video',
      thumbnail: 'https://example.com/thumb.jpg',
      uploader: 'uploader123',
      duration: 300,
      platform: 'bilibili',
    });
    const savedTask = {
      id: 1,
      parentId: 10,
      childId: 20,
      sourceUrl: 'https://www.bilibili.com/video/BV123',
      title: 'Bilibili Video',
      thumbnail: 'https://example.com/thumb.jpg',
      uploader: 'uploader123',
      duration: 300,
      platform: 'bilibili',
      status: 'pending',
      filePath: null,
      fileSize: null,
      errorMessage: '',
      publishedToChild: false,
    };
    const repo = createRepo({
      create: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue(savedTask),
    });
    const service = createService(repo);
    const result = await service.createDownload(10, 'https://www.bilibili.com/video/BV123', 20);
    expect(result.id).toBe(1);
    expect(result.status).toBe('pending');
    expect(result.parentId).toBe(10);
    expect(result.childId).toBe(20);
    expect(result.sourceUrl).toBe('https://www.bilibili.com/video/BV123');
    expect(result.platform).toBe('bilibili');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 10, childId: 20, status: 'pending' }),
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('uses URL as title when metadata extraction fails', async () => {
    failExtract();
    const savedTask = {
      id: 2,
      parentId: 10,
      childId: 20,
      sourceUrl: 'https://www.youtube.com/watch?v=xyz',
      title: 'https://www.youtube.com/watch?v=xyz',
      thumbnail: null,
      uploader: null,
      duration: null,
      platform: 'youtube',
      status: 'pending',
      filePath: null,
      fileSize: null,
      errorMessage: '',
      publishedToChild: false,
    };
    const repo = createRepo({
      create: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue(savedTask),
    });
    const service = createService(repo);
    const result = await service.createDownload(10, 'https://www.youtube.com/watch?v=xyz', 20);
    expect(result.title).toBe('https://www.youtube.com/watch?v=xyz');
    expect(result.platform).toBe('youtube');
  });

  it('extracts URL from share text before creating', async () => {
    succeedWithExtract({
      title: 'Extracted Title',
      thumbnail: null,
      uploader: null,
      duration: null,
      platform: 'douyin',
    });
    const savedTask = {
      id: 3,
      parentId: 10,
      childId: null,
      sourceUrl: 'https://www.douyin.com/video/123',
      title: 'Extracted Title',
      platform: 'douyin',
      status: 'pending',
    };
    const repo = createRepo({
      create: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue(savedTask),
    });
    const service = createService(repo);
    const shareText = '7.17 复制打开抖音 https://www.douyin.com/video/123 快来观看';
    const result = await service.createDownload(10, shareText);
    expect(result.sourceUrl).toBe('https://www.douyin.com/video/123');
    expect(result.childId).toBeNull();
  });

  it('sets childId to null when omitted', async () => {
    succeedWithExtract({
      title: 'No Child Video',
      thumbnail: null,
      uploader: null,
      duration: null,
      platform: 'unknown',
    });
    const savedTask = {
      id: 4,
      parentId: 10,
      childId: null,
      sourceUrl: 'https://example.com/video',
      status: 'pending',
    };
    const repo = createRepo({
      create: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue(savedTask),
    });
    const service = createService(repo);
    const result = await service.createDownload(10, 'https://example.com/video');
    expect(result.childId).toBeNull();
  });

  it('throws BadRequestException for invalid URL', async () => {
    const repo = createRepo();
    const service = createService(repo);
    await expect(service.createDownload(10, 'this is not a valid url')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('detects bilibili short link (b23.tv)', async () => {
    succeedWithExtract({
      title: 'Short Link Video',
      thumbnail: null,
      uploader: null,
      duration: null,
      platform: 'bilibili',
    });
    const savedTask = {
      id: 5,
      parentId: 10,
      childId: null,
      sourceUrl: 'https://b23.tv/short',
      platform: 'bilibili',
      status: 'pending',
    };
    const repo = createRepo({
      create: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue(savedTask),
    });
    const service = createService(repo);
    const result = await service.createDownload(10, 'https://b23.tv/short');
    expect(result.sourceUrl).toBe('https://b23.tv/short');
    expect(result.platform).toBe('bilibili');
  });

  it('passes background download errors silently via .catch()', async () => {
    succeedWithExtract({
      title: 'Failing Video',
      thumbnail: null,
      uploader: null,
      duration: null,
      platform: 'youtube',
    });
    // Background download will throw — should NOT propagate
    failDownload();
    const savedTask = {
      id: 6,
      parentId: 10,
      childId: null,
      sourceUrl: 'https://www.youtube.com/watch?v=fail',
      title: 'Failing Video',
      platform: 'youtube',
      status: 'pending',
    };
    const repo = createRepo({
      create: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue(savedTask),
    });
    const service = createService(repo);
    const result = await service.createDownload(10, 'https://www.youtube.com/watch?v=fail');
    expect(result.status).toBe('pending');
  });
});
