import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from '../notification/notification.service';
import { UsersService } from '../users/users.service';
import { SafetyClassifier } from './safety-classifier.service';
import { SafetyDetector } from './safety-detector.service';
import { SafetyEvent } from './safety-event.entity';
import type { SafetyFlag, SafetyVerdict } from './safety.types';

export interface SafetyCheckParams {
  childId: number;
  parentId?: number | null;
  text: string;
  /** Only used to pick the comfort line — never to decide whether to detect. */
  ageGroup?: string;
}

/**
 * The safety circuit breaker that sits in front of the dialogue LLM.
 *
 * Two layers, deliberately not symmetrical:
 *
 *  1. **Synchronous word list** — local, sub-millisecond, no LLM. A hit
 *     short-circuits the turn: the model is never called and the child
 *     hears a comfort line instead.
 *  2. **Asynchronous classifier** — a model call that runs *after* the
 *     reply is on its way, for the signals a word list cannot see. It
 *     never delays an answer and never changes what the child hears.
 *
 * Why this is not a tool the LLM may choose to call: putting the
 * detection behind the model's judgement means the protected model
 * decides whether it needs protecting. The word list must run even when
 * every model backend is down.
 *
 * Ported from 碎碎念 `agent/safety/` (detector + classifier).
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly detector: SafetyDetector,
    private readonly classifier: SafetyClassifier,
    @InjectRepository(SafetyEvent)
    private readonly eventRepo: Repository<SafetyEvent>,
    private readonly notificationService: NotificationService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {
    const raw = this.configService.get<string>('SAFETY_ENABLED', 'true');
    this.enabled = !['false', '0', 'no', 'off'].includes(String(raw).trim().toLowerCase());
    if (!this.enabled) {
      this.logger.warn(
        'SAFETY_ENABLED=false — the synchronous word list is OFF. ' +
          'This is a development switch; production must leave it on.',
      );
    }
  }

  /**
   * The synchronous gate. Returns within a millisecond; never throws.
   *
   * `intercepted: true` means the caller must not call the LLM and should
   * speak `reply` instead.
   */
  checkMessage(params: SafetyCheckParams): SafetyVerdict {
    const startedAt = process.hrtime.bigint();
    const flags = this.enabled ? this.detector.detect(params.text) : [];
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    if (flags.length === 0) {
      return { intercepted: false, flags: [], latencyMs };
    }

    // Recording and notifying must not delay the reply the child hears,
    // so the write happens off the critical path.
    void this.persist(params, flags, 'intercepted');

    this.logger.warn(
      `safety circuit opened for child=${params.childId} ` +
        `categories=${[...new Set(flags.map((f) => f.category))].join(',')} ` +
        `latency=${latencyMs.toFixed(2)}ms`,
    );

    return {
      intercepted: true,
      reply: comfortLine(params.ageGroup),
      flags,
      latencyMs,
    };
  }

  /**
   * Second layer: score the passage with a model, off the reply path.
   *
   * Fire-and-forget by contract — callers `void` this. A failure is
   * logged and swallowed: this layer widens coverage, it does not gate
   * anything.
   */
  classifyInBackground(params: SafetyCheckParams): void {
    if (!this.enabled) return;
    void this.classifier
      .classify(params.text)
      .then((flags) => {
        if (flags.length === 0) return;
        const critical = flags.filter((flag) => flag.level === 'critical');
        return this.persist(
          params,
          flags,
          critical.length > 0 ? 'intercepted' : 'queued',
        );
      })
      .catch((err) => {
        this.logger.warn(`safety classifier background pass failed: ${err?.message ?? err}`);
      });
  }

  /** Recent events for one child, newest first. Parent-facing read. */
  async listEvents(childId: number, limit = 20): Promise<SafetyEvent[]> {
    return this.eventRepo.find({
      where: { childId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /** Recent events for every child of one parent. */
  async listEventsForParent(parentId: number, limit = 20): Promise<SafetyEvent[]> {
    return this.eventRepo.find({
      where: { parentId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Write the audit row, then queue a parent inbox item.
   *
   * The notification body deliberately carries no excerpt: the audit
   * trail is for calibration, the parent message is a doorbell. The
   * excerpt in the DB is never surfaced through the API either — see
   * `toPublicEvent` in the controller.
   */
  private async persist(
    params: SafetyCheckParams,
    flags: SafetyFlag[],
    action: 'intercepted' | 'queued',
  ): Promise<void> {
    const parentId = params.parentId ?? (await this.resolveParentId(params.childId));
    const worst = flags.find((flag) => flag.level === 'critical') ?? flags[0];

    let eventId: number | undefined;
    try {
      const saved = await this.eventRepo.save(
        this.eventRepo.create({
          childId: params.childId,
          parentId: parentId ?? undefined,
          category: worst.category,
          level: worst.level,
          source: worst.source,
          excerpt: flags
            .map((flag) => flag.snippet)
            .filter(Boolean)
            .join(' | ')
            .slice(0, 500),
          action,
        }),
      );
      eventId = saved.id;
    } catch (err) {
      this.logger.error(`could not record safety event: ${(err as Error).message}`);
    }

    if (!parentId) {
      this.logger.warn(
        `safety event for child=${params.childId} has no bound parent — not notified`,
      );
      return;
    }

    try {
      await this.notificationService.create({
        userId: parentId,
        title: worst.level === 'critical' ? '需要您关注的一条消息' : '孩子近况提醒',
        message:
          worst.level === 'critical'
            ? '孩子刚才说了一句让系统警觉的话，建议您现在去陪他说说话、了解情况。'
            : '孩子最近的情绪似乎有些低落，方便的话多问一句今天过得怎么样。',
        type: 'safety',
        relatedId: eventId,
      });
      if (eventId != null) {
        await this.eventRepo.update(eventId, { notifiedAt: new Date() });
      }
    } catch (err) {
      this.logger.error(`could not notify parent: ${(err as Error).message}`);
    }
  }

  private async resolveParentId(childId: number): Promise<number | null> {
    try {
      const child = await this.usersService.findById(childId);
      return child?.parentId ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * What the child hears instead of a model answer.
 *
 * Keyed by age group only for tone — the detection above never reads the
 * age, so adding a new age band is a matter of adding one line here (or
 * leaving it to the default) rather than touching the safety logic.
 */
const COMFORT_LINES: Record<string, string> = {
  '3-4': '我在这里陪着你。我们先去找爸爸妈妈，好不好？',
  '5-6': '我在呢，别怕。现在先去找爸爸妈妈，跟他们说一声，好吗？',
  '7-9': '我在这里，先别慌。现在去找爸爸妈妈或老师，把这件事告诉他们，好吗？',
  '10-12': '我在这里，先别急。这件事需要大人知道，现在就去找爸爸妈妈或老师说明情况。',
  default: '我在呢，别怕。现在先去找身边的大人，跟他们说一声，好吗？',
};

export function comfortLine(ageGroup?: string): string {
  if (ageGroup && COMFORT_LINES[ageGroup]) return COMFORT_LINES[ageGroup];
  return COMFORT_LINES.default;
}
