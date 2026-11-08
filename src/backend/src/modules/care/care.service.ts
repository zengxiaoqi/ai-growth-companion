import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CareCue } from './care-cue.entity';

/**
 * Proactive care: when the app is allowed to ask about something by
 * itself, and how often.
 *
 * Three constraints do all the work, and each of them exists because the
 * opposite behaviour is creepy or annoying:
 *
 *  1. **A time window.** A care question may only *open* a conversation
 *     between 15:30 and 20:00 local — after school, before dinner. A cue
 *     that comes due at 7am simply waits.
 *  2. **One cue per conversation, one per 24 hours.** The 24h gate is
 *     global per child, not per cue: it is the backstop for a bug in the
 *     cue table, because "asked the same thing four times" is the failure
 *     a family notices.
 *  3. **A short life.** A cue older than a few days is expired, not
 *     asked: 「上周的春游好玩吗」 asked on Friday is worse than silence.
 *
 * Ported from 碎碎念 `care/scheduler.py` (`due_cue`).
 */
@Injectable()
export class CareService {
  private readonly logger = new Logger(CareService.name);
  private readonly windowStartMinutes: number;
  private readonly windowEndMinutes: number;
  private readonly expireAfterDays: number;
  private readonly maxPostpone: number;
  private readonly minGapHours: number;
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(CareCue)
    private readonly cueRepo: Repository<CareCue>,
    private readonly configService: ConfigService,
  ) {
    this.windowStartMinutes = parseClock(
      this.configService.get<string>('CARE_WINDOW_START', '15:30'),
      15 * 60 + 30,
    );
    this.windowEndMinutes = parseClock(
      this.configService.get<string>('CARE_WINDOW_END', '20:00'),
      20 * 60,
    );
    this.expireAfterDays = intOr(this.configService.get<string>('CARE_EXPIRE_DAYS'), 3);
    this.maxPostpone = intOr(this.configService.get<string>('CARE_MAX_POSTPONE'), 3);
    this.minGapHours = intOr(this.configService.get<string>('CARE_MIN_GAP_HOURS'), 24);
    const raw = this.configService.get<string>('CARE_ENABLED', 'true');
    this.enabled = !['false', '0', 'no', 'off'].includes(String(raw).trim().toLowerCase());
  }

  /**
   * Register a "ask about this later" cue.
   *
   * Never throws: a missing cue costs one nice moment, a failed save must
   * not fail the memory write that triggered it.
   */
  async schedule(params: {
    childId: number;
    memoryId?: number;
    topic: string;
    dueAt: string;
  }): Promise<CareCue | null> {
    if (!this.enabled) return null;
    const topic = (params.topic ?? '').trim();
    if (!topic || !/^\d{4}-\d{2}-\d{2}$/.test(params.dueAt ?? '')) return null;

    try {
      return await this.cueRepo.save(
        this.cueRepo.create({
          childId: params.childId,
          memoryId: params.memoryId ?? null,
          topic: topic.slice(0, 500),
          dueAt: params.dueAt,
          status: 'pending',
        }),
      );
    } catch (err) {
      this.logger.warn(`could not schedule care cue: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * The one cue this conversation may open with, or null.
   *
   * Marks the cue as asked before returning it: two conversations started
   * in the same second must not both get it.
   */
  async dueCue(childId: number, now = new Date()): Promise<CareCue | null> {
    if (!this.enabled) return null;

    try {
      // This project has no scheduler, and `dueCue` is the single entry
      // point for opening a conversation — so cleanup lives here rather
      // than in a job nobody wires up. It also runs outside the care
      // window: a morning chat should still retire last week's cue.
      await this.expireStale(now);

      if (!this.insideWindow(now)) return null;
      if (await this.askedRecently(childId, now)) return null;

      const today = toDateString(now);
      const candidates = await this.cueRepo.find({
        where: { childId, status: 'pending', dueAt: LessThanOrEqual(today) },
        order: { dueAt: 'ASC' },
        take: 5,
      });

      const cue = candidates.find((item) => item.postponeCount < this.maxPostpone);
      if (!cue) return null;

      cue.status = 'asked';
      cue.sentAt = now;
      await this.cueRepo.save(cue);
      return cue;
    } catch (err) {
      this.logger.warn(`could not read care cues: ${(err as Error).message}`);
      return null;
    }
  }

  /** The child did not want to talk about it: never ask again. */
  async reject(cueId: number): Promise<void> {
    await this.cueRepo.update(cueId, { status: 'rejected' });
  }

  /** Push a cue back by one day, up to the cap. */
  async postpone(cueId: number, now = new Date()): Promise<void> {
    const cue = await this.cueRepo.findOne({ where: { id: cueId } });
    if (!cue) return;
    const nextCount = cue.postponeCount + 1;
    if (nextCount >= this.maxPostpone) {
      await this.cueRepo.update(cueId, {
        status: 'expired',
        postponeCount: nextCount,
      });
      return;
    }
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    await this.cueRepo.update(cueId, {
      postponeCount: nextCount,
      dueAt: toDateString(next),
    });
  }

  /**
   * Expire cues that are too old to ask about.
   *
   * Called by `dueCue` on every conversation open. There is no scheduler
   * dependency; the query is idempotent and touches only pending cues older
   * than the cap, so an occasional extra call costs nothing.
   */
  async expireStale(now = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - this.expireAfterDays);
    const result = await this.cueRepo.update(
      { status: 'pending', dueAt: LessThanOrEqual(toDateString(cutoff)) },
      { status: 'expired' },
    );
    return result.affected ?? 0;
  }

  /**
   * The 24-hour gate.
   *
   * Global per child on purpose: one conversation per day may open with a
   * care question, whatever the cue table says.
   */
  private async askedRecently(childId: number, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - this.minGapHours * 3_600_000);
    const recent = await this.cueRepo.count({
      where: { childId, status: 'asked', sentAt: MoreThanOrEqual(since) },
    });
    return recent > 0;
  }

  /** Whether `now` falls inside the local care window (may wrap midnight). */
  private insideWindow(now: Date): boolean {
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (this.windowStartMinutes <= this.windowEndMinutes) {
      return minutes >= this.windowStartMinutes && minutes <= this.windowEndMinutes;
    }
    // Window crosses midnight.
    return minutes >= this.windowStartMinutes || minutes <= this.windowEndMinutes;
  }
}

function parseClock(value: string | undefined, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function intOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
