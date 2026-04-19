import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AbilityAssessment } from "../../database/entities/ability-assessment.entity";
import { v4 as uuidv4 } from "uuid";

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
      order: { assessedAt: "DESC" },
    });
  }

  async getLatestByDomain(userId: number, domain: string) {
    return this.assessmentRepository.findOne({
      where: { userId, domain },
      order: { assessedAt: "DESC" },
    });
  }

  private getLevel(score: number): string {
    if (score >= 80) return "advanced";
    if (score >= 60) return "intermediate";
    return "beginner";
  }
}
