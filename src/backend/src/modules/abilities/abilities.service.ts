import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbilityAssessment } from '../../database/entities/ability-assessment.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AbilitiesService {
  constructor(
    @InjectRepository(AbilityAssessment)
    private assessmentRepository: Repository<AbilityAssessment>,
  ) {}

  async create(userId: number, domain: string, score: number, evidence?: any) {
    const level = this.getLevel(score);
    const assessment = this.assessmentRepository.create({
      uuid: uuidv4(),
      userId,
      domain,
      score,
      level,
      evidence: evidence || {},
    });
    return this.assessmentRepository.save(assessment);
  }

  async getByUser(userId: number) {
    return this.assessmentRepository.find({
      where: { userId },
      order: { assessedAt: 'DESC' },
    });
  }

  async getLatestByDomain(userId: number, domain: string) {
    return this.assessmentRepository.findOne({
      where: { userId, domain },
      order: { assessedAt: 'DESC' },
    });
  }

  /**
   * Append an assessment smoothed by an exponential moving average
   * (0.7 previous + 0.3 new), mirroring LearningTrackerService.updateAbility.
   * The first write keeps the raw score. Used by the english-practice coach so
   * a single noisy observation cannot swing the child's level.
   */
  async updateWithEma(userId: number, domain: string, score: number, evidence?: any) {
    const latest = await this.getLatestByDomain(userId, domain);
    const previousScore = latest?.score ?? null;
    const newScore =
      previousScore == null ? score : Math.round(0.7 * previousScore + 0.3 * score);
    return this.create(userId, domain, newScore, {
      ...(evidence || {}),
      previousScore,
      newScore,
    });
  }

  private getLevel(score: number): string {
    if (score >= 80) return 'advanced';
    if (score >= 60) return 'intermediate';
    return 'beginner';
  }
}
