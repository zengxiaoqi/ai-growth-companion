import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Achievement } from "../../database/entities/achievement.entity";
import { NotificationService } from "../notification/notification.service";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class AchievementsService {
  constructor(
    @InjectRepository(Achievement)
    private achievementRepository: Repository<Achievement>,
    private notificationService: NotificationService,
  ) {}

  async create(data: {
    userId: number;
    type: string;
    name: string;
    description?: string;
  }) {
    const achievement = this.achievementRepository.create({
      uuid: uuidv4(),
      userId: data.userId,
      achievementType: data.type,
      achievementName: data.name,
      description: data.description,
    });
    const saved = await this.achievementRepository.save(achievement);

    // Send notification for new achievement
    await this.notificationService.notifyAchievement(data.userId, data.name);

    return saved;
  }

  async findById(id: number) {
    return this.achievementRepository.findOne({ where: { id } });
  }

  async findByUser(userId: number) {
    return this.achievementRepository.find({
      where: { userId },
      order: { earnedAt: "DESC" },
    });
  }

  async findByUserCount(userId: number, type?: string): Promise<number> {
    const where: any = { userId };
    if (type) where.achievementType = type;
    return this.achievementRepository.count({ where });
  }

  async checkAndAward(
    userId: number,
    type: string,
  ): Promise<Achievement | null> {
    const existing = await this.achievementRepository.findOne({
      where: { userId, achievementType: type },
    });
    if (existing) return null;
    return this.create({ userId, type, name: this.getNameByType(type) });
  }

  /**
   * Check and award multiple achievements for a user based on activity context.
   * Returns list of newly awarded achievement types.
   */
  async checkAchievements(
    userId: number,
    context: {
      type:
        | "content_completion"
        | "assignment_completion"
        | "interactive_activity";
      score: number;
      domain: string;
    },
    stats: {
      totalLearningRecords: number;
      completedAssignments: number;
      completedActivities: number;
      distinctDomains: string[];
      latestAbilityScores: Record<string, number>;
    },
  ): Promise<string[]> {
    const awarded: string[] = [];

    const check = async (type: string) => {
      const result = await this.checkAndAward(userId, type);
      if (result) awarded.push(type);
    };

    // Type-specific checks
    if (context.type === "assignment_completion") {
      await check("first_homework");
      if (context.score === 100) await check("perfect_homework");
      if (stats.completedAssignments >= 3) await check("homework_streak_3");
      if (stats.completedAssignments >= 7) await check("homework_streak_7");
      if (stats.completedAssignments >= 10) await check("homework_master_10");
    }

    if (context.type === "interactive_activity") {
      await check("first_activity");
      if (context.score === 100) await check("perfect_activity");
      if (stats.completedActivities >= 5) await check("activity_streak_5");
      if (stats.completedActivities >= 20) await check("activity_master_20");
    }

    if (context.type === "content_completion") {
      await check("first_lesson");
    }

    // General checks (always run)
    if (stats.totalLearningRecords >= 3) await check("daily_learner");
    if (stats.distinctDomains.length >= 5) await check("explorer_5");

    // Domain ability achievements
    if (stats.latestAbilityScores["art"] >= 80) await check("art_talent");
    if (stats.latestAbilityScores["social"] >= 80) await check("social_star");
    if (stats.latestAbilityScores["language"] >= 80)
      await check("language_master");
    if (stats.latestAbilityScores["math"] >= 80) await check("math_wizard");
    if (stats.latestAbilityScores["science"] >= 80)
      await check("science_explorer");

    return awarded;
  }

  private getNameByType(type: string): string {
    const names: Record<string, string> = {
      // Existing
      first_lesson: "初次学习",
      daily_goal: "每日目标",
      week_streak: "连续学习",
      language_master: "语言大师",
      math_wizard: "数学小天才",
      science_explorer: "科学探索者",
      // Assignment
      first_homework: "初次完成作业",
      homework_streak_3: "作业小能手",
      homework_streak_7: "作业达人",
      perfect_homework: "满分作业",
      homework_master_10: "作业大师",
      // Interactive activity
      first_activity: "初次互动学习",
      activity_streak_5: "互动达人",
      activity_master_20: "互动大师",
      perfect_activity: "满分互动",
      // Domain
      art_talent: "艺术天赋",
      social_star: "社交之星",
      // General
      daily_learner: "每日学习者",
      explorer_5: "五域探索者",
    };
    return names[type] || "成就";
  }
}
