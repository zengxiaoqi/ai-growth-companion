import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { User } from "../entities/user.entity";
import { Content } from "../entities/content.entity";

@Injectable()
export class DatabaseSeederService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  async seed() {
    const userCount = await this.userRepository.count();
    if (userCount > 0) {
      console.log("Database already has data, skipping seed...");
      return;
    }

    console.log("Starting database seed...");
    await this.seedUsers();
    await this.seedContents();
    console.log("✅ Database seed completed!");
  }

  private async seedUsers() {
    const hashedPassword = await bcrypt.hash("password123", 10);

    const parent = await this.userRepository.save({
      phone: "13800000001",
      password: hashedPassword,
      name: "家长用户",
      type: "parent",
      settings: { notifications: true, language: "zh-CN" },
    });

    await this.userRepository.save({
      phone: "13800000002",
      password: hashedPassword,
      name: "小明",
      type: "child",
      age: 5,
      parentId: parent.id,
      settings: { avatar: "🐶", favoriteTopics: ["animals", "stories"] },
    });

    console.log(`Created 2 test users (parent id=${parent.id})`);
  }

  private async seedContents() {
    const contents = [
      // === 3-4 岁内容 (6个) ===
      {
        uuid: "c101",
        title: "小熊找蜂蜜",
        subtitle: "关于友谊的故事",
        ageRange: "3-4",
        domain: "language",
        topic: "stories",
        difficulty: 1,
        durationMinutes: 10,
        contentType: "story",
        content: JSON.stringify({
          text: "从前有一只小熊，他很想去旅行...",
          pages: [],
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c102",
        title: "认识数字 1-10",
        subtitle: "基础数学启蒙",
        ageRange: "3-4",
        domain: "math",
        topic: "numbers",
        difficulty: 1,
        durationMinutes: 15,
        contentType: "lesson",
        content: JSON.stringify({
          exercises: [],
          intro: "让我们一起认识数字吧！",
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c103",
        title: "动物叫声配对",
        subtitle: "认识动物",
        ageRange: "3-4",
        domain: "science",
        topic: "animals",
        difficulty: 1,
        durationMinutes: 8,
        contentType: "game",
        content: JSON.stringify({
          pairs: [],
          description: "把动物和它们的叫声连起来",
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c104",
        title: "彩色的世界",
        subtitle: "认识基础颜色",
        ageRange: "3-4",
        domain: "art",
        topic: "colors",
        difficulty: 1,
        durationMinutes: 12,
        contentType: "lesson",
        content: JSON.stringify({
          colors: ["红色", "蓝色", "黄色", "绿色"],
          activities: [],
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c105",
        title: "我会分享",
        subtitle: "学习分享玩具",
        ageRange: "3-4",
        domain: "social",
        topic: "sharing",
        difficulty: 1,
        durationMinutes: 10,
        contentType: "story",
        content: JSON.stringify({
          text: "小兔子学会和朋友分享玩具了...",
          moral: "分享让我们更快乐",
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c106",
        title: "比大小游戏",
        subtitle: "谁更大谁更小",
        ageRange: "3-4",
        domain: "math",
        topic: "comparison",
        difficulty: 1,
        durationMinutes: 8,
        contentType: "game",
        content: JSON.stringify({ comparisons: [], levels: 3 }),
        mediaUrls: [],
        status: "published",
      },

      // === 5-6 岁内容 (6个) ===
      {
        uuid: "c201",
        title: "小蝌蚪找妈妈",
        subtitle: "了解青蛙的生长过程",
        ageRange: "5-6",
        domain: "science",
        topic: "animal-growth",
        difficulty: 2,
        durationMinutes: 15,
        contentType: "story",
        content: JSON.stringify({
          text: "小蝌蚪游啊游，开始找妈妈...",
          stages: ["卵", "蝌蚪", "长腿", "青蛙"],
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c202",
        title: "认识汉字",
        subtitle: "学习简单的汉字",
        ageRange: "5-6",
        domain: "language",
        topic: "chinese-characters",
        difficulty: 2,
        durationMinutes: 20,
        contentType: "lesson",
        content: JSON.stringify({
          characters: ["日", "月", "水", "火", "山"],
          strokes: [],
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c203",
        title: "10以内加减法",
        subtitle: "数学运算入门",
        ageRange: "5-6",
        domain: "math",
        topic: "addition-subtraction",
        difficulty: 2,
        durationMinutes: 18,
        contentType: "lesson",
        content: JSON.stringify({
          operations: ["+", "-"],
          range: 10,
          examples: [],
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c204",
        title: "画小猫",
        subtitle: "简单绘画入门",
        ageRange: "5-6",
        domain: "art",
        topic: "drawing",
        difficulty: 2,
        durationMinutes: 15,
        contentType: "lesson",
        content: JSON.stringify({
          steps: ["画圆头", "画耳朵", "画眼睛", "画胡须"],
          materials: ["纸", "笔"],
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c205",
        title: "情绪小管家",
        subtitle: "认识和控制情绪",
        ageRange: "5-6",
        domain: "social",
        topic: "emotions",
        difficulty: 2,
        durationMinutes: 12,
        contentType: "story",
        content: JSON.stringify({
          emotions: ["开心", "生气", "害怕", "难过"],
          strategies: ["深呼吸", "说出来", "找帮助"],
        }),
        mediaUrls: [],
        status: "published",
      },
      {
        uuid: "c206",
        title: "四季变化",
        subtitle: "认识春夏秋冬",
        ageRange: "5-6",
        domain: "science",
        topic: "seasons",
        difficulty: 2,
        durationMinutes: 15,
        contentType: "lesson",
        content: JSON.stringify({
          seasons: {
            spring: "温暖花开",
            summer: "炎热游泳",
            autumn: "凉爽落叶",
            winter: "寒冷下雪",
          },
        }),
        mediaUrls: [],
        status: "published",
      },
    ];

    await this.contentRepository.save(contents);
    console.log(`Created ${contents.length} learning contents`);
  }
}
