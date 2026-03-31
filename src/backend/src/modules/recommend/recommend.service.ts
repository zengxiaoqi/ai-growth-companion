import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { Content } from '../../database/entities/content.entity';
import { AbilityAssessment } from '../../database/entities/ability-assessment.entity';
import { ParentControl } from '../../database/entities/parent-control.entity';

interface RecommendParams {
  userId: number;
  ageRange: string;
}

@Injectable()
export class RecommendService {
  constructor(
    @InjectRepository(LearningRecord)
    private learningRecordRepository: Repository<LearningRecord>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(AbilityAssessment)
    private abilityRepository: Repository<AbilityAssessment>,
    @InjectRepository(ParentControl)
    private controlRepository: Repository<ParentControl>,
  ) {}

  /**
   * 智能推荐算法
   * 1. 分析用户历史学习记录
   * 2. 评估用户能力水平
   * 3. 推荐合适的内容
   */
  async recommend(params: RecommendParams) {
    const { userId, ageRange } = params;

    // 1. 获取用户最近学习记录
    const recentRecords = await this.learningRecordRepository.find({
      where: { userId },
      order: { startedAt: 'DESC' },
      take: 10,
    });

    // 2. 获取用户能力评估
    const abilities = await this.abilityRepository.find({
      where: { userId },
    });

    // 3. 分析用户偏好领域
    const domainScores = this.analyzePreferences(recentRecords);

    // 4. 获取推荐内容
    const recommendedContents = await this.getRecommendedContent(
      ageRange,
      domainScores,
      abilities,
      recentRecords.map(r => r.contentId),
      userId,
    );

    const reason = this.generateReason(domainScores, abilities);

    const recommendations = recommendedContents.map((content, index) => ({
      contentId: content.id,
      content,
      reason,
      priority: recommendedContents.length - index,
    }));

    return {
      recommended: recommendations,
      reason,
      nextLevel: this.suggestNextLevel(abilities),
    };
  }

  private analyzePreferences(records: LearningRecord[]) {
    const domainScores: Record<string, number> = {};
    
    // 简单统计：用户学习最多的领域 (从关联的 content 获取)
    for (const record of records) {
      // 如果有 content 关联，从 content 获取 domain
      const domain = record.content?.domain || 'language';
      domainScores[domain] = (domainScores[domain] || 0) + 1;
    }
    
    return domainScores;
  }

  private async getRecommendedContent(
    ageRange: string,
    domainScores: Record<string, number>,
    abilities: AbilityAssessment[],
    excludeIds: number[],
    userId?: number,
  ) {
    // Find out weak domains to prioritize
    const weakDomains = this.getWeakDomains(abilities, domainScores);

    // Check parent controls for allowed domains
    let allowedDomains: string[] | null = null;
    if (userId) {
      const control = await this.controlRepository.findOne({
        where: { childId: userId },
      });
      if (control?.allowedDomains?.length > 0) {
        allowedDomains = control.allowedDomains;
      }
    }

    // Build query
    const query = this.contentRepository.createQueryBuilder('content')
      .where('content.ageRange = :ageRange', { ageRange })
      .andWhere('content.status = :status', { status: 'published' });

    if (excludeIds.length > 0) {
      query.andWhere('content.id NOT IN (:...excludeIds)', { excludeIds });
    }

    // Apply parent domain filter (overrides weak domain logic)
    const domainsToUse = allowedDomains || weakDomains;
    if (domainsToUse.length > 0) {
      query.andWhere('content.domain IN (:...domains)', { domains: domainsToUse });
    }

    return query
      .orderBy('content.difficulty', 'ASC')
      .take(5)
      .getMany();
  }

  private getWeakDomains(abilities: AbilityAssessment[], domainScores: Record<string, number>) {
    if (!abilities || abilities.length === 0) return ['language', 'math', 'science'];
    
    // Create a map of domain -> score
    const scoreMap: Record<string, number> = {};
    for (const ability of abilities) {
      scoreMap[ability.domain] = ability.score || 0;
    }
    
    // Convert to array and sort
    const scores = Object.entries(scoreMap).map(([domain, score]) => ({ domain, score }));
    
    // Return weakest 2 domains
    return scores.sort((a, b) => a.score - b.score).slice(0, 2).map(s => s.domain);
  }

  private generateReason(domainScores: Record<string, number>, abilities: AbilityAssessment[]) {
    if (!abilities || abilities.length === 0) return '根据您的年龄推荐适合的内容';
    
    const weakDomains = this.getWeakDomains(abilities, domainScores);
    if (weakDomains.length > 0) {
      const domainNames: Record<string, string> = {
        language: '语言',
        math: '数学',
        science: '科学',
        art: '艺术',
        social: '社会',
      };
      return `您最近在 ${weakDomains.map(d => domainNames[d] || d).join('、')} 方面有进步，我们推荐了一些相关内容`;
    }
    
    return '根据您的学习进度推荐';
  }

  private suggestNextLevel(abilities: AbilityAssessment[] | null) {
    if (!abilities || abilities.length === 0) return null;
    
    const scores = abilities.map(a => a.score || 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avgScore < 30) return { level: 1, message: '从基础开始' };
    if (avgScore < 60) return { level: 2, message: '可以尝试进阶内容' };
    return { level: 3, message: '挑战高级内容！' };
  }
}