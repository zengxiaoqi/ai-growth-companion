import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { AbilityAssessment } from '../../database/entities/ability-assessment.entity';
import { Achievement } from '../../database/entities/achievement.entity';

interface ReportParams {
  userId: number;
  period: 'daily' | 'weekly' | 'monthly';
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(LearningRecord)
    private learningRecordRepository: Repository<LearningRecord>,
    @InjectRepository(AbilityAssessment)
    private abilityRepository: Repository<AbilityAssessment>,
    @InjectRepository(Achievement)
    private achievementRepository: Repository<Achievement>,
  ) {}

  async generateReport(params: ReportParams) {
    const { userId, period } = params;
    const dateRange = this.getDateRange(period);

    const learningStats = await this.getLearningStats(userId, dateRange);
    const abilityChange = await this.getAbilityChange(userId, dateRange);
    const achievementStats = await this.getAchievementStats(userId, dateRange);

    return {
      period,
      dateRange,
      summary: this.generateSummary(learningStats, achievementStats),
      learning: learningStats,
      abilities: abilityChange,
      achievements: achievementStats,
      insights: this.generateInsights(learningStats),
      encouragement: this.generateEncouragement(abilityChange),
    };
  }

  private getDateRange(period: string) {
    const now = new Date();
    let start: Date;

    switch (period) {
      case 'daily':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return { start, end: new Date() };
  }

  private async getLearningStats(userId: number, dateRange: { start: Date; end: Date }) {
    const records = await this.learningRecordRepository.find({
      where: {
        userId,
        startedAt: Between(dateRange.start, dateRange.end),
      },
    });

    const totalTime = records.reduce((sum, r) => sum + (r.durationSeconds || 0), 0);
    const completedCount = records.filter(r => r.status === 'completed').length;

    const domainStats: Record<string, number> = {};
    for (const record of records) {
      const domain = record.content?.domain || 'other';
      domainStats[domain] = (domainStats[domain] || 0) + 1;
    }

    return {
      totalSessions: records.length,
      completedSessions: completedCount,
      totalMinutes: Math.round(totalTime / 60),
      domainStats,
      streakDays: await this.calculateStreak(userId),
    };
  }

  private async calculateStreak(userId: number): Promise<number> {
    let streak = 0;
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const record = await this.learningRecordRepository.findOne({
        where: {
          userId,
          startedAt: Between(dayStart, dayEnd),
        },
      });
      
      if (record) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    
    return streak;
  }

  private async getAbilityChange(userId: number, dateRange: { start: Date; end: Date }) {
    const abilities = await this.abilityRepository.find({
      where: { userId },
      order: { assessedAt: 'DESC' },
      take: 2,
    });

    if (abilities.length < 2) {
      return {
        current: abilities[0] || null,
        change: null,
      };
    }

    const current = abilities[0];
    const previous = abilities[1];

    // Calculate changes based on domain
    const currentByDomain = abilities.filter(a => a.userId === current.userId);
    const previousByDomain = abilities.filter(a => a.userId === previous?.userId);

    const getScore = (domain: string, records: any[]) => 
      records.find(r => r.domain === domain)?.score || 0;

    return {
      current,
      change: {
        language: getScore('language', currentByDomain) - getScore('language', previousByDomain),
        math: getScore('math', currentByDomain) - getScore('math', previousByDomain),
        science: getScore('science', currentByDomain) - getScore('science', previousByDomain),
        art: getScore('art', currentByDomain) - getScore('art', previousByDomain),
        social: getScore('social', currentByDomain) - getScore('social', previousByDomain),
      },
    };
  }

  private async getAchievementStats(userId: number, dateRange: { start: Date; end: Date }) {
    const achievements = await this.achievementRepository.find({
      where: {
        userId,
        earnedAt: Between(dateRange.start, dateRange.end),
      },
    });

    return {
      total: achievements.length,
      recent: achievements.slice(0, 5),
    };
  }

  private generateSummary(learning: any, achievements: any): string {
    const points: string[] = [];
    
    if (learning.completedSessions > 0) {
      points.push(`完成了 ${learning.completedSessions} 个学习任务`);
    }
    
    if (learning.totalMinutes > 0) {
      points.push(`学习时长 ${learning.totalMinutes} 分钟`);
    }
    
    if (learning.streakDays > 0) {
      points.push(`连续学习 ${learning.streakDays} 天`);
    }
    
    if (achievements.total > 0) {
      points.push(`获得 ${achievements.total} 个成就`);
    }

    return points.length > 0 ? points.join('，') : '今天还没有学习记录';
  }

  private generateInsights(learning: any): string[] {
    const insights: string[] = [];

    if (learning.totalSessions >= 3) {
      insights.push('学习很积极！保持这个节奏');
    }

    const domains = learning.domainStats || {};
    const domainEntries = Object.entries(domains) as [string, number][];
    if (domainEntries.length > 0) {
      const maxDomain = domainEntries.sort((a, b) => b[1] - a[1])[0];
      const domainNames: Record<string, string> = {
        language: '语言',
        math: '数学',
        science: '科学',
        art: '艺术',
        social: '社会',
      };
      if (maxDomain) {
        insights.push(`喜欢 ${domainNames[maxDomain[0]] || maxDomain[0]} 领域的内容`);
      }
    }

    return insights;
  }

  private generateEncouragement(abilities: any) {
    const messages = [
      '每天进步一点点！🌟',
      '你很棒！继续探索新知识！🚀',
      '学习是一件快乐的事！📚',
      '坚持就是胜利！💪',
      '你是最棒的！✨',
    ];

    if (abilities && abilities.change) {
      const change = abilities.change as any;
      const totalChange = (change.language || 0) + (change.math || 0) + 
        (change.science || 0) + (change.art || 0) + (change.social || 0);
      
      if (totalChange > 10) {
        return '进步太大了！为你骄傲！🏆';
      }
    }

    return messages[Math.floor(Math.random() * messages.length)];
  }
}