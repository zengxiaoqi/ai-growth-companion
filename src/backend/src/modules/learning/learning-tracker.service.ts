import { Injectable, Logger } from '@nestjs/common';
import { LearningService } from './learning.service';
import { AbilitiesService } from '../abilities/abilities.service';
import { AchievementsService } from '../achievements/achievements.service';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from '../../database/entities/achievement.entity';

export type ActivityType = 'content_completion' | 'assignment_completion' | 'interactive_activity';

export interface RecordActivityParams {
  type: ActivityType;
  childId: number;
  contentId?: number;
  assignmentId?: number;
  domain: string;
  score: number;
  durationSeconds?: number;
  metadata?: Record<string, any>;
}

export interface RecordActivityResult {
  learningRecord: LearningRecord;
  abilityUpdated: boolean;
  achievementsAwarded: string[];
}

@Injectable()
export class LearningTrackerService {
  private readonly logger = new Logger(LearningTrackerService.name);

  constructor(
    private readonly learningService: LearningService,
    private readonly abilitiesService: AbilitiesService,
    private readonly achievementsService: AchievementsService,
    @InjectRepository(LearningRecord)
    private readonly recordRepo: Repository<LearningRecord>,
    @InjectRepository(Achievement)
    private readonly achievementRepo: Repository<Achievement>,
  ) {}

  async recordActivity(params: RecordActivityParams): Promise<RecordActivityResult> {
    this.logger.log(`Recording activity: type=${params.type}, child=${params.childId}, domain=${params.domain}, score=${params.score}`);

    // 1. Create learning record
    const contentId = params.contentId || 0; // 0 indicates no specific content
    const record = await this.learningService.create(params.childId, contentId);
    await this.learningService.update(record.id, {
      score: params.score,
      status: 'completed',
      completedAt: new Date(),
      durationSeconds: params.durationSeconds || 0,
      interactionData: {
        source: params.type,
        assignmentId: params.assignmentId,
        domain: params.domain,
        ...params.metadata,
      },
    });

    // 2. Update ability assessment
    const abilityUpdated = await this.updateAbility(params.childId, params.domain, params.score, params.type);

    // 3. Check and award achievements
    const stats = await this.gatherStats(params.childId);
    const achievementsAwarded = await this.achievementsService.checkAchievements(
      params.childId,
      { type: params.type, score: params.score, domain: params.domain },
      stats,
    );

    this.logger.log(`Activity recorded: record=${record.id}, abilityUpdated=${abilityUpdated}, achievements=${achievementsAwarded.length}`);

    return {
      learningRecord: record,
      abilityUpdated,
      achievementsAwarded,
    };
  }

  private async updateAbility(childId: number, domain: string, score: number, source: string): Promise<boolean> {
    try {
      const latest = await this.abilitiesService.getLatestByDomain(childId, domain);
      let newScore: number;

      if (latest) {
        newScore = Math.round(0.7 * latest.score + 0.3 * score);
      } else {
        newScore = score;
      }

      await this.abilitiesService.create(childId, domain, newScore, {
        source,
        previousScore: latest?.score,
        newScore,
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to update ability for child=${childId}, domain=${domain}: ${error.message}`);
      return false;
    }
  }

  private async gatherStats(childId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = await this.recordRepo
      .createQueryBuilder('r')
      .where('r.userId = :childId', { childId })
      .andWhere('r.startedAt >= :today', { today })
      .getMany();

    const allRecords = await this.recordRepo
      .createQueryBuilder('r')
      .where('r.userId = :childId', { childId })
      .getMany();

    const domains = new Set<string>();
    let completedAssignments = 0;
    let completedActivities = 0;

    for (const r of allRecords) {
      if (r.interactionData?.domain) {
        domains.add(r.interactionData.domain);
      }
      if (r.interactionData?.source === 'assignment_completion') {
        completedAssignments++;
      }
      if (r.interactionData?.source === 'interactive_activity') {
        completedActivities++;
      }
    }

    const abilities = await this.abilitiesService.getByUser(childId);
    const latestAbilityScores: Record<string, number> = {};
    for (const a of abilities) {
      if (latestAbilityScores[a.domain] === undefined) {
        latestAbilityScores[a.domain] = a.score;
      }
    }

    return {
      totalLearningRecords: todayRecords.length,
      completedAssignments,
      completedActivities,
      distinctDomains: Array.from(domains),
      latestAbilityScores,
    };
  }
}
