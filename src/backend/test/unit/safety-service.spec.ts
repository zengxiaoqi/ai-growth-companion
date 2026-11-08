import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { SafetyClassifier } from '../../src/modules/safety/safety-classifier.service';
import { SafetyDetector } from '../../src/modules/safety/safety-detector.service';
import { SafetyService } from '../../src/modules/safety/safety.service';
import type { SafetyEvent } from '../../src/modules/safety/safety-event.entity';
import type { NotificationService } from '../../src/modules/notification/notification.service';
import type { UsersService } from '../../src/modules/users/users.service';
import type { LlmClientService } from '../../src/agent-framework/llm/llm-client.service';

interface Recorder {
  events: any[];
  notifications: any[];
}

function build(env: Record<string, string> = {}): {
  service: SafetyService;
  classifier: SafetyClassifier;
  recorded: Recorder;
} {
  const recorded: Recorder = { events: [], notifications: [] };
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;

  const eventRepo = {
    create: (entity: any) => entity,
    save: async (entity: any) => {
      recorded.events.push(entity);
      return { ...entity, id: 99 };
    },
    update: async () => undefined,
    find: async () => [],
  } as unknown as Repository<SafetyEvent>;

  const notificationService = {
    create: async (payload: any) => {
      recorded.notifications.push(payload);
      return payload;
    },
  } as unknown as NotificationService;

  const usersService = {
    findById: async () => ({ id: 1, parentId: 2, name: '小明' }),
  } as unknown as UsersService;

  const llm = {
    isConfigured: true,
    generate: async () => '{"self_harm": 0.0, "bullied": 0.0, "danger": 0.0}',
  } as unknown as LlmClientService;

  const detector = new SafetyDetector(config);
  detector.onModuleInit();
  const classifier = new SafetyClassifier(llm, config);

  return {
    service: new SafetyService(
      detector,
      classifier,
      eventRepo,
      notificationService,
      usersService,
      config,
    ),
    classifier,
    recorded,
  };
}

/** Let the fire-and-forget write finish before asserting on it. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The circuit breaker's contract: a hit short-circuits the turn, the
 * parent is told *something happened* without being told the words, and
 * the whole path works with no model call at all.
 */
describe('SafetyService', () => {
  it('intercepts an explicit cry for help and speaks a comfort line', async () => {
    const { service } = build();
    const verdict = service.checkMessage({
      childId: 1,
      parentId: 2,
      text: '救命，有坏人来了',
      ageGroup: '5-6',
    });

    expect(verdict.intercepted).toBe(true);
    expect(verdict.reply).toBeTruthy();
    expect(verdict.flags.length).toBeGreaterThan(0);
  });

  it('answers in the tone of the current age group', async () => {
    const { service } = build();
    const younger = service.checkMessage({ childId: 1, text: '救命', ageGroup: '3-4' });
    const older = service.checkMessage({ childId: 1, text: '救命', ageGroup: '5-6' });
    expect(younger.reply).not.toBe(older.reply);
  });

  it('does not intercept ordinary conversation', async () => {
    const { service, recorded } = build();
    const verdict = service.checkMessage({ childId: 1, parentId: 2, text: '我想吃西瓜' });
    expect(verdict.intercepted).toBe(false);
    expect(verdict.flags).toEqual([]);
    await settle();
    expect(recorded.events).toHaveLength(0);
  });

  it('records the event and queues a parent notification', async () => {
    const { service, recorded } = build();
    service.checkMessage({ childId: 1, parentId: 2, text: '救命' });
    await settle();

    expect(recorded.events).toHaveLength(1);
    expect(recorded.events[0]).toMatchObject({
      childId: 1,
      parentId: 2,
      category: 'danger',
      level: 'critical',
      action: 'intercepted',
    });
    expect(recorded.notifications).toHaveLength(1);
    expect(recorded.notifications[0].userId).toBe(2);
  });

  it('never puts the matched words in the notification body', async () => {
    const { service, recorded } = build();
    service.checkMessage({ childId: 1, parentId: 2, text: '救命，着火了' });
    await settle();

    const body: string = recorded.notifications[0].message;
    expect(body).not.toContain('救命');
    expect(body).not.toContain('着火');
    // The excerpt is still kept server-side for calibration.
    expect(recorded.events[0].excerpt).toContain('救命');
  });

  it('is a no-op when the development switch turns detection off', async () => {
    const { service } = build({ SAFETY_ENABLED: 'false' });
    const verdict = service.checkMessage({ childId: 1, text: '救命' });
    expect(verdict.intercepted).toBe(false);
  });

  it('reports a sub-millisecond local match', async () => {
    const { service } = build();
    const verdict = service.checkMessage({ childId: 1, text: '救命，有坏人来了' });
    expect(verdict.latencyMs).toBeLessThan(10);
  });
});

describe('SafetyClassifier', () => {
  function withScores(payload: string, env: Record<string, string> = {}) {
    const config = {
      get: (key: string, fallback?: string) => env[key] ?? fallback,
    } as unknown as ConfigService;
    const llm = {
      isConfigured: true,
      generate: async () => payload,
    } as unknown as LlmClientService;
    return new SafetyClassifier(llm, config);
  }

  it('maps a high score to a critical flag', async () => {
    const flags = await withScores('{"self_harm": 0.9, "bullied": 0.0, "danger": 0.0}').classify(
      '我是多余的',
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ category: 'self_harm', level: 'critical', source: 'classifier' });
  });

  it('maps a middle score to a watch flag, which never interrupts the child', async () => {
    const flags = await withScores('{"self_harm": 0.0, "bullied": 0.45, "danger": 0.0}').classify(
      '同学不跟我玩',
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].level).toBe('watch');
  });

  it('returns no flags when the model call fails — the rule layer is the guarantee', async () => {
    const config = { get: (_k: string, f?: string) => f } as unknown as ConfigService;
    const llm = {
      isConfigured: true,
      generate: async () => {
        throw new Error('upstream 502');
      },
    } as unknown as LlmClientService;
    const classifier = new SafetyClassifier(llm, config);
    await expect(classifier.classify('我不想去上学了')).resolves.toEqual([]);
  });

  it('returns no flags on unparseable output', async () => {
    await expect(withScores('抱歉，我不能判断').classify('随便一句话')).resolves.toEqual([]);
  });
});
