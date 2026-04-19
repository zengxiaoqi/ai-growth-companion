import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import { LearningRecord } from "../../database/entities/learning-record.entity";
import { AbilityAssessment } from "../../database/entities/ability-assessment.entity";
import { Achievement } from "../../database/entities/achievement.entity";

interface ReportParams {
  userId: number;
  period: "daily" | "weekly" | "monthly";
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
    const dailyStats = await this.getDailyStats(userId, dateRange, period);
    const skillProgress = await this.getSkillProgress(userId);

    const learningSummary = this.generateSummary(
      learningStats,
      achievementStats,
    );

    return {
      userId,
      period,
      startDate: dateRange.start.toISOString(),
      endDate: dateRange.end.toISOString(),
      totalLearningTime: learningStats.totalMinutes * 60, // seconds
      totalLessonsCompleted: learningStats.completedSessions,
      averageScore: this.calculateAverageScore(dailyStats),
      dailyStats,
      skillProgress,
      achievements: achievementStats.recent || [],
      insights: this.generateInsights(learningStats),
      streak: learningStats.streakDays,
      // Extra fields for backward compatibility
      summary: learningSummary,
      learning: learningStats,
      abilities: abilityChange,
      encouragement: this.generateEncouragement(abilityChange),
    };
  }

  private getDateRange(period: string) {
    const now = new Date();
    let start: Date;

    switch (period) {
      case "daily":
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "weekly":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "monthly":
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return { start, end: new Date() };
  }

  private async getLearningStats(
    userId: number,
    dateRange: { start: Date; end: Date },
  ) {
    const records = await this.learningRecordRepository.find({
      where: {
        userId,
        startedAt: Between(dateRange.start, dateRange.end),
      },
    });

    const totalTime = records.reduce(
      (sum, r) => sum + (r.durationSeconds || 0),
      0,
    );
    const completedCount = records.filter(
      (r) => r.status === "completed",
    ).length;

    const domainStats: Record<string, number> = {};
    for (const record of records) {
      const domain = record.content?.domain || "other";
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

  private async getDailyStats(
    userId: number,
    dateRange: { start: Date; end: Date },
    period: string,
  ) {
    const records = await this.learningRecordRepository.find({
      where: {
        userId,
        startedAt: Between(dateRange.start, dateRange.end),
      },
      order: { startedAt: "ASC" },
    });

    // Group by day
    const dayMap = new Map<
      string,
      { totalTime: number; completed: number; scores: number[] }
    >();

    for (const record of records) {
      const dayKey = new Date(record.startedAt).toISOString().slice(0, 10);
      const existing = dayMap.get(dayKey) || {
        totalTime: 0,
        completed: 0,
        scores: [] as number[],
      };
      existing.totalTime += record.durationSeconds || 0;
      if (record.status === "completed") {
        existing.completed++;
        if (record.score != null) existing.scores.push(record.score);
      }
      dayMap.set(dayKey, existing);
    }

    // Build array for the period
    const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
    const result: {
      date: string;
      totalTime: number;
      completedLessons: number;
      averageScore: number;
    }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(dateRange.end);
      date.setDate(date.getDate() - i);
      const dayKey = date.toISOString().slice(0, 10);
      const data = dayMap.get(dayKey);
      result.push({
        date: dayKey,
        totalTime: data?.totalTime || 0,
        completedLessons: data?.completed || 0,
        averageScore:
          data && data.scores.length > 0
            ? Math.round(
                data.scores.reduce((s, v) => s + v, 0) / data.scores.length,
              )
            : 0,
      });
    }

    return result;
  }

  private async getSkillProgress(
    userId: number,
  ): Promise<Record<string, number>> {
    const abilities = await this.abilityRepository.find({
      where: { userId },
      order: { assessedAt: "DESC" },
    });

    const domainProgress: Record<string, number> = {
      language: 0,
      math: 0,
      science: 0,
      art: 0,
      social: 0,
    };

    // Take latest score per domain
    const seen = new Set<string>();
    for (const a of abilities) {
      if (seen.has(a.domain)) continue;
      seen.add(a.domain);
      if (a.domain in domainProgress) {
        domainProgress[a.domain] = Math.min(100, Math.max(0, a.score || 0));
      }
    }

    return domainProgress;
  }

  private calculateAverageScore(
    dailyStats: { averageScore: number }[],
  ): number {
    const daysWithScore = dailyStats.filter((d) => d.averageScore > 0);
    if (daysWithScore.length === 0) return 0;
    return Math.round(
      daysWithScore.reduce((s, d) => s + d.averageScore, 0) /
        daysWithScore.length,
    );
  }

  async getAbilityTrend(userId: number, weeks: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);
    startDate.setHours(0, 0, 0, 0);

    const assessments = await this.abilityRepository
      .createQueryBuilder("a")
      .where("a.userId = :userId", { userId })
      .andWhere("a.assessedAt >= :start", { start: startDate })
      .orderBy("a.assessedAt", "ASC")
      .getMany();

    if (assessments.length === 0) {
      return [];
    }

    const now = new Date();
    const domains = ["language", "math", "science", "art", "social"] as const;
    const weekMap = new Map<number, Map<string, number[]>>();

    for (const assessment of assessments) {
      const daysDiff = Math.floor(
        (now.getTime() - assessment.assessedAt.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const weekNum = weeks - Math.floor(daysDiff / 7);

      if (!weekMap.has(weekNum)) {
        weekMap.set(weekNum, new Map<string, number[]>());
        for (const d of domains) {
          weekMap.get(weekNum)!.set(d, []);
        }
      }
      const weekData = weekMap.get(weekNum)!;
      const scores = weekData.get(assessment.domain);
      if (scores) {
        scores.push(assessment.score);
      }
    }

    const result: {
      week: string;
      language: number;
      math: number;
      science: number;
      art: number;
      social: number;
    }[] = [];
    const sortedWeeks = [...weekMap.keys()].sort((a, b) => a - b);
    for (const weekNum of sortedWeeks) {
      const weekData = weekMap.get(weekNum)!;
      const avg = (domain: string) => {
        const scores = weekData.get(domain) || [];
        return scores.length > 0
          ? Math.round(
              (scores.reduce((s, v) => s + v, 0) / scores.length) * 100,
            ) / 100
          : 0;
      };
      result.push({
        week: `第${weekNum}周`,
        language: avg("language"),
        math: avg("math"),
        science: avg("science"),
        art: avg("art"),
        social: avg("social"),
      });
    }

    return result;
  }

  async getRecentMasteredSkills(userId: number, limit: number) {
    const assessments = await this.abilityRepository.find({
      where: { userId },
      order: { assessedAt: "DESC" },
      take: limit,
    });

    const domainLabels: Record<string, string> = {
      language: "语言表达",
      math: "数学逻辑",
      science: "科学探索",
      art: "艺术创造",
      social: "社会交往",
    };

    return assessments.map((a) => ({
      domain: a.domain,
      level: a.level,
      label: domainLabels[a.domain] || a.domain,
    }));
  }

  private async calculateStreak(userId: number): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const records = await this.learningRecordRepository
      .createQueryBuilder("lr")
      .select("DISTINCT DATE(lr.startedAt)", "day")
      .where("lr.userId = :userId", { userId })
      .andWhere("lr.startedAt >= :start", { start: thirtyDaysAgo })
      .getRawMany();

    const activeDays = new Set(records.map((r) => r.day));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      if (activeDays.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }

  private async getAbilityChange(
    userId: number,
    dateRange: { start: Date; end: Date },
  ) {
    const abilities = await this.abilityRepository.find({
      where: { userId },
      order: { assessedAt: "DESC" },
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
    const currentByDomain = abilities.filter(
      (a) => a.userId === current.userId,
    );
    const previousByDomain = abilities.filter(
      (a) => a.userId === previous?.userId,
    );

    const getScore = (domain: string, records: any[]) =>
      records.find((r) => r.domain === domain)?.score || 0;

    return {
      current,
      change: {
        language:
          getScore("language", currentByDomain) -
          getScore("language", previousByDomain),
        math:
          getScore("math", currentByDomain) -
          getScore("math", previousByDomain),
        science:
          getScore("science", currentByDomain) -
          getScore("science", previousByDomain),
        art:
          getScore("art", currentByDomain) - getScore("art", previousByDomain),
        social:
          getScore("social", currentByDomain) -
          getScore("social", previousByDomain),
      },
    };
  }

  private async getAchievementStats(
    userId: number,
    dateRange: { start: Date; end: Date },
  ) {
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

    return points.length > 0 ? points.join("，") : "今天还没有学习记录";
  }

  private generateInsights(learning: any): string[] {
    const insights: string[] = [];

    if (learning.totalSessions >= 3) {
      insights.push("学习很积极！保持这个节奏");
    }

    const domains = learning.domainStats || {};
    const domainEntries = Object.entries(domains) as [string, number][];
    if (domainEntries.length > 0) {
      const maxDomain = domainEntries.sort((a, b) => b[1] - a[1])[0];
      const domainNames: Record<string, string> = {
        language: "语言",
        math: "数学",
        science: "科学",
        art: "艺术",
        social: "社会",
      };
      if (maxDomain) {
        insights.push(
          `喜欢 ${domainNames[maxDomain[0]] || maxDomain[0]} 领域的内容`,
        );
      }
    }

    return insights;
  }

  private generateEncouragement(abilities: any) {
    const messages = [
      "每天进步一点点！🌟",
      "你很棒！继续探索新知识！🚀",
      "学习是一件快乐的事！📚",
      "坚持就是胜利！💪",
      "你是最棒的！✨",
    ];

    if (abilities && abilities.change) {
      const change = abilities.change as any;
      const totalChange =
        (change.language || 0) +
        (change.math || 0) +
        (change.science || 0) +
        (change.art || 0) +
        (change.social || 0);

      if (totalChange > 10) {
        return "进步太大了！为你骄傲！🏆";
      }
    }

    return messages[Math.floor(Math.random() * messages.length)];
  }
}
