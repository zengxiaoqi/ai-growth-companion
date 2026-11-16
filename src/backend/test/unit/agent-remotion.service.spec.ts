import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentRemotionService } from '../../src/modules/learning/agent-remotion.service';
import * as authorContract from '../../src/modules/learning/video/author-contract';

jest.mock('../../src/modules/learning/video/author-contract', () => {
  const actual = jest.requireActual('../../src/modules/learning/video/author-contract');
  return { ...actual, validateAuthorTaskDir: jest.fn() };
});

const validateMock = authorContract.validateAuthorTaskDir as jest.Mock;

function makeService(remotionDir: string, runLoop: jest.Mock) {
  const executor = { runLoop } as any;
  const toolRegistry = { getToolDefinitions: jest.fn(() => []) } as any;
  const llmClient = { isConfigured: true, authorModel: 'test-author' } as any;
  const remotionRender = {
    remotionProjectDir: remotionDir,
    tryGenerateNarrationAudio: jest.fn(async (..._args: any[]) => ({
      buffer: Buffer.from('fake-mp3'),
      durationFrames: 200,
      wordBoundaries: [],
    })),
    renderPreparedComposition: jest.fn(async () => {}),
  } as any;
  const videoGenerationAgent = {
    buildDynamicSceneProps: jest.fn(async () => [
      {
        id: 'scene-1',
        title: '彩虹是什么',
        narration: '雨过天晴，天上会出现彩虹。',
        onScreenText: '彩虹',
        visualDescription: '天空中的彩虹',
        durationFrames: 180,
        accentColor: '#FF6B6B',
        figure: { shapes: [{ type: 'arc' }] },
        visualAssets: {
          characterAssetSrc: 'assets/rainbow.png',
          backgroundAssetSrc: 'assets/sky.png',
          overlayAssetSrc: ['assets/sun.png'],
        },
        graphIcons: { n1: 'icons/cloud.png' },
      },
    ]),
  } as any;
  const service = new AgentRemotionService(
    executor,
    toolRegistry,
    llmClient,
    remotionRender,
    videoGenerationAgent,
  );
  return { service, remotionRender, videoGenerationAgent, toolRegistry };
}

const TASK = { id: 42, cacheKey: 'ck' } as any;
const PAYLOAD = {
  topic: '彩虹',
  domain: 'science',
  ageGroup: '3-4',
  __storyboard: {
    title: '彩虹的样子',
    topic: '彩虹',
    visualTheme: { accentColor: '#3E63DD', backgroundColor: '#FFF8E8' },
    scenes: [{ title: '彩虹是什么', beats: [{ sentenceIndex: 0, motion: 'pop' }] }],
  },
};

describe('AgentRemotionService', () => {
  let remotionDir: string;

  beforeEach(async () => {
    remotionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-remotion-'));
    delete process.env.VIDEO_AGENT_REMOTION;
    validateMock.mockReset();
    validateMock.mockResolvedValue({ ok: true, errors: [] });
  });

  afterEach(async () => {
    await fs.rm(remotionDir, { recursive: true, force: true });
  });

  it('pre-places the contract task dir, wires TTS/assets, and renders', async () => {
    const runLoop = jest.fn(async (..._args: any[]) => ({
      response: '{"status":"ok","compositionId":"AgentLesson42"}',
      toolCalls: [
        { tool: 'loadSkill', args: {}, resultSummary: '' },
        { tool: 'renderStills', args: {}, resultSummary: '{"frames":["a.png"],"roundsUsed":1}' },
        { tool: 'visualQa', args: {}, resultSummary: '' },
        // 契约失败的 renderStills 不消耗静帧预算
        { tool: 'renderStills', args: {}, resultSummary: '{"error":"contract violation"}' },
        { tool: 'renderStills', args: {}, resultSummary: '{"frames":["b.png"],"roundsUsed":2}' },
      ],
      tokenUsage: { prompt: 100, completion: 200 },
    }));
    const { service, remotionRender } = makeService(remotionDir, runLoop);

    const result = await service.renderToVideo(TASK, PAYLOAD, '/tmp/out.mp4');
    expect(result.stillsRounds).toBe(2);
    // 真实时间轴随渲染结果返回（QA 抽帧用它，不用分镜估算）
    expect(result.sceneTimeline).toEqual([
      {
        title: '彩虹是什么',
        narration: '雨过天晴，天上会出现彩虹。',
        onScreenText: '彩虹',
        durationSec: 230 / 30,
      },
    ]);

    // authoring 模型覆盖 + token 预算经 context/参数下发
    const ctx = runLoop.mock.calls[0][4];
    expect(ctx.metadata.authoring).toBe(true);
    expect(ctx.ageGroup).toBe('3-4');
    expect(runLoop.mock.calls[0][6]).toBe(32000);

    const taskDir = path.join(remotionDir, '.generated', 'remotion-tasks');
    const dirs = await fs.readdir(taskDir);
    expect(dirs).toHaveLength(1);
    const dir = path.join(taskDir, dirs[0]);

    const props = JSON.parse(await fs.readFile(path.join(dir, 'props.json'), 'utf-8'));
    expect(props.durationFrames).toBe(230); // max(180, 200 + 30)
    expect(props.accentColor).toBe('#3E63DD');
    expect(props.scenes[0].narrationSrc).toMatch(/^\.generated\/remotion-tasks\/.+\/narration-1-[a-f0-9]{12}\.mp3$/);
    expect(props.scenes[0].beats).toEqual([{ sentenceIndex: 0, motion: 'pop' }]);
    expect(props.scenes[0].characterSrc).toBe('assets/rainbow.png');
    expect(props.scenes[0].overlaySrcs).toEqual(['assets/sun.png']);
    expect(props.scenes[0].graphIcons).toEqual({ n1: 'icons/cloud.png' });

    // TTS mp3 真的落进 public 任务目录
    const publicDir = path.join(remotionDir, 'public', '.generated', 'remotion-tasks', dirs[0]);
    const mp3s = await fs.readdir(publicDir);
    expect(mp3s.some((f) => f.startsWith('narration-1-'))).toBe(true);

    expect(await fs.readFile(path.join(dir, 'contract.ts'), 'utf-8')).toContain('AuthorLessonProps');
    expect(await fs.readFile(path.join(dir, 'Root.tsx'), 'utf-8')).toContain('AgentLesson42');
    expect(await fs.readFile(path.join(dir, 'index.ts'), 'utf-8')).toContain('registerRoot');

    expect(remotionRender.renderPreparedComposition).toHaveBeenCalledWith(
      dir,
      'AgentLesson42',
      '/tmp/out.mp4',
      undefined,
    );
  });

  it('toolGuard enforces write→renderStills alternation and rejects empty writes', async () => {
    const runLoop = jest.fn(async (..._args: any[]) => ({
      response: '{"status":"ok"}',
      toolCalls: [],
    }));
    const { service } = makeService(remotionDir, runLoop);
    await service.renderToVideo(TASK, PAYLOAD, '/tmp/out.mp4');

    const guard = runLoop.mock.calls[0][8];
    expect(typeof guard).toBe('function');
    expect(guard('writeFile', { content: 'export const GeneratedLesson = () => null;' })).toBeNull();
    expect(guard('writeFile', { content: 'rewrite' })).toMatch(/renderStills/);
    expect(guard('writeFile', { content: '   ' })).toMatch(/空/);
    expect(guard('renderStills', {})).toBeNull();
    expect(guard('writeFile', { content: 'fix' })).toBeNull();
    expect(guard('visualQa', {})).toBeNull();
    expect(guard('writeFile', { content: 'fix2' })).toBeNull();
    expect(guard('writeFile', { content: 'fix3' })).toMatch(/renderStills/);
    expect(guard('readFile', { path: 'a' })).toBeNull();
  });

  it('history transform compresses big writeFile args and injects the current file as a user message', async () => {
    const fileContent = 'export const GeneratedLesson = () => null;\n'.repeat(200);
    const runLoop = jest.fn(async (...args: any[]) => {
      const userMessage = String(args[1]?.[0]?.content || '');
      const taskDir = userMessage.match(/taskDir: (.+)/)?.[1]?.trim();
      await fs.writeFile(path.join(taskDir, 'GeneratedLesson.tsx'), fileContent, 'utf-8');
      return { response: '{"status":"ok"}', toolCalls: [] };
    });
    const { service } = makeService(remotionDir, runLoop);
    await service.renderToVideo(TASK, PAYLOAD, '/tmp/out.mp4');

    const transform = runLoop.mock.calls[0][7];
    expect(typeof transform).toBe('function');

    const bigArgs = JSON.stringify({ path: 'GeneratedLesson.tsx', content: fileContent });
    const history: any[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'props…' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', function: { name: 'writeFile', arguments: bigArgs } }],
      },
      { role: 'tool', toolCallId: 'c1', content: '{"ok":true}' },
      { role: 'user', content: '[author-file-state] 旧注入应被丢弃' },
    ];
    const out = await transform(history);

    // 旧注入被丢弃，只保留最新一份
    const injections = out.filter((m: any) => String(m.content).startsWith('[author-file-state]'));
    expect(injections).toHaveLength(1);
    expect(injections[0].content).toContain(fileContent);
    expect(out[out.length - 1].role).toBe('user');

    // 大 writeFile 参数被压缩成摘要（网关会截断 >4096 的 assistant 参数）
    const call = out.find((m: any) => m.role === 'assistant')!.toolCalls[0];
    const compressed = JSON.parse(call.function.arguments);
    expect(compressed.content).toBeUndefined();
    expect(compressed.note).toContain('[author-file-state]');
    expect(call.function.arguments.length).toBeLessThan(3000);

    // 小参数与非 writeFile 调用不动
    const small = JSON.stringify({ path: 'a.txt', content: 'hi' });
    const out2 = await transform([
      { role: 'assistant', content: null, toolCalls: [{ id: 'c2', function: { name: 'writeFile', arguments: small } }] },
      { role: 'tool', toolCallId: 'c2', content: '{"ok":true}' },
    ]);
    expect(out2[0].toolCalls[0].function.arguments).toBe(small);
  });

  it('throws and cleans up when the author does not finalize ok', async () => {
    const runLoop = jest.fn(async (..._args: any[]) => ({
      response: 'I could not finish',
      toolCalls: [],
    }));
    const { service, remotionRender } = makeService(remotionDir, runLoop);

    await expect(service.renderToVideo(TASK, PAYLOAD, '/tmp/out.mp4')).rejects.toThrow(
      /did not finalize ok/,
    );
    expect(remotionRender.renderPreparedComposition).not.toHaveBeenCalled();
    const tasksRoot = path.join(remotionDir, '.generated', 'remotion-tasks');
    expect(await fs.readdir(tasksRoot)).toEqual([]);
    const publicRoot = path.join(remotionDir, 'public', '.generated', 'remotion-tasks');
    expect(await fs.readdir(publicRoot)).toEqual([]);
  });

  it('throws and cleans up when the post-loop contract check fails', async () => {
    validateMock.mockResolvedValue({ ok: false, errors: ['forbidden in authored code: fetch()'] });
    const runLoop = jest.fn(async (..._args: any[]) => ({
      response: '{"status":"ok"}',
      toolCalls: [],
    }));
    const { service, remotionRender } = makeService(remotionDir, runLoop);

    await expect(service.renderToVideo(TASK, PAYLOAD, '/tmp/out.mp4')).rejects.toThrow(
      /contract failed/,
    );
    expect(remotionRender.renderPreparedComposition).not.toHaveBeenCalled();
  });

  it('is unavailable when VIDEO_AGENT_REMOTION=off', () => {
    process.env.VIDEO_AGENT_REMOTION = 'off';
    const { service } = makeService(remotionDir, jest.fn());
    expect(service.isAvailable).toBe(false);
  });

  it('rejects payloads without a storyboard', async () => {
    const { service } = makeService(remotionDir, jest.fn());
    await expect(
      service.renderToVideo(TASK, { topic: '彩虹' }, '/tmp/out.mp4'),
    ).rejects.toThrow(/missing topic or storyboard/);
  });
});