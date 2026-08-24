import { DshBridgeService } from '../../src/modules/learning/dsh-bridge.service';
import { VoiceService } from '../../src/modules/voice/voice.service';

const voiceService = { textToSpeech: jest.fn().mockResolvedValue(Buffer.from('audio')) } as unknown as VoiceService;

describe('DshBridgeService', () => {
  let service: DshBridgeService;

  beforeEach(() => {
    delete process.env.VIDEO_DSH_ENABLED;
    service = new DshBridgeService(voiceService);
  });

  afterEach(() => {
    delete process.env.VIDEO_DSH_ENABLED;
  });

  describe('renderWithDsh', () => {
    it('returns null when the bridge is disabled', async () => {
      process.env.VIDEO_DSH_ENABLED = 'false';
      const disabled = new DshBridgeService(voiceService);
      const task: any = { id: 1, cacheKey: 'k' };
      expect(await disabled.renderWithDsh(task, { topic: '水循环' })).toBeNull();
    });

    it('returns null without touching the filesystem when topic is missing', async () => {
      const task: any = { id: 1, cacheKey: 'k' };
      expect(await service.renderWithDsh(task, {})).toBeNull();
    });
  });

  describe('buildInput', () => {
    it('maps the payload into the DSH input contract', () => {
      const input = (service as any).buildInput(
        { topic: '兔子', ageGroup: '3-4', domain: 'science', videoLesson: { shots: [{}, {}, {}] } },
        '/tmp/w',
        [],
      );
      expect(input.topic).toBe('兔子');
      expect(input.ageGroup).toBe('3-4');
      expect(input.domain).toBe('science');
      expect(input.sceneCount).toBe(3);
      expect(input.outputDir).toBe('/tmp/w');
      expect(input.width).toBe(1920);
      expect(input.height).toBe(1080);
    });

    it('defaults sceneCount to 5 when there are no shots', () => {
      const input = (service as any).buildInput({ topic: '水' }, '/tmp/w', []);
      expect(input.sceneCount).toBe(5);
    });

    it('includes narrationSrc paths when provided', () => {
      const input = (service as any).buildInput(
        { topic: 'test', videoLesson: {} },
        '/tmp/w',
        ['/tmp/a.mp3'],
      );
      expect(input.narrationSrc).toEqual(['/tmp/a.mp3']);
    });
  });

  describe('buildPrompt', () => {
    it('contains the absolute paths and the one-line JSON contract', () => {
      const prompt = (service as any).buildPrompt('/a/input.json', '/a/out');
      expect(prompt).toContain('/a/input.json');
      expect(prompt).toContain('/a/out');
      expect(prompt).toContain('{"status":"ok","manifestPath"');
      expect(prompt).toContain('{"status":"failed","error"');
    });
  });

  describe('extractResultJson', () => {
    it('parses the ok contract from the final JSON line of noisy stdout', () => {
      const stdout =
        'working...' +
        String.fromCharCode(10) +
        '{"status":"ok","manifestPath":"/a/m.json"}' +
        String.fromCharCode(10);
      const r = (service as any).extractResultJson(stdout);
      expect(r?.status).toBe('ok');
      expect(r?.manifestPath).toBe('/a/m.json');
    });

    it('returns null for non-JSON stdout', () => {
      expect((service as any).extractResultJson('just plain text')).toBeNull();
    });
  });
});
