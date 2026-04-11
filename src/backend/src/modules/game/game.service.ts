import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { Content } from '../../database/entities/content.entity';

interface GameResult {
  gameId: string;
  score: number;
  timeSpent: number;
  correctAnswers: number;
  totalQuestions: number;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

/**
 * 互动游戏引擎
 * 支持：配对游戏、问答游戏、排序游戏、闯关模式
 */
@Injectable()
export class GameService {
  constructor(
    @InjectRepository(LearningRecord)
    private learningRecordRepository: Repository<LearningRecord>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
  ) {}

  /**
   * 获取游戏列表
   */
  getGameList(ageRange: string) {
    const games: Record<string, any[]> = {
      '3-4': [
        { id: 'color_match', name: '颜色配对', type: 'match', difficulty: 1, description: '找出相同的颜色' },
        { id: 'shape_match', name: '形状配对', type: 'match', difficulty: 1, description: '找出相同的形状' },
        { id: 'animal_sound', name: '动物叫声', type: 'quiz', difficulty: 1, description: '听声音猜动物' },
        { id: 'count_simple', name: '简单数数', type: 'count', difficulty: 1, description: '数一数有多少' },
      ],
      '5-6': [
        { id: 'word_match', name: '汉字配对', type: 'match', difficulty: 2, description: '找出相同的汉字' },
        { id: 'math_quiz', name: '数学问答', type: 'quiz', difficulty: 2, description: '简单数学题' },
        { id: 'sequence', name: '排序游戏', type: 'sequence', difficulty: 2, description: '找出规律' },
        { id: 'riddle', name: '猜谜语', type: 'riddle', difficulty: 3, description: '猜猜是什么' },
      ],
    };

    return games[ageRange] || games['3-4'];
  }

  /**
   * 生成游戏题目
   */
  generateGame(gameId: string, difficulty: number = 1) {
    const gameGenerators: Record<string, Function> = {
      'color_match': () => this.generateColorMatch(difficulty),
      'shape_match': () => this.generateShapeMatch(difficulty),
      'animal_sound': () => this.generateAnimalQuiz(difficulty),
      'count_simple': () => this.generateCountGame(difficulty),
      'word_match': () => this.generateWordMatch(difficulty),
      'math_quiz': () => this.generateMathQuiz(difficulty),
      'sequence': () => this.generateSequence(difficulty),
      'riddle': () => this.generateRiddle(difficulty),
    };

    const generator = gameGenerators[gameId];
    if (!generator) {
      return { error: '游戏不存在' };
    }

    return generator();
  }

  /**
   * 记录游戏结果
   */
  async saveGameResult(userId: number, gameId: string, result: GameResult) {
    // 计算得分
    const score = result.correctAnswers > 0
      ? Math.round((result.correctAnswers / result.totalQuestions) * 100)
      : 0;

    // Map gameId to contentId by matching game domain to content
    const contentIdNum = await this.resolveContentId(gameId);
    const record = this.learningRecordRepository.create({
      uuid: crypto.randomUUID(),
      userId,
      contentId: contentIdNum,
      startedAt: new Date(),
      durationSeconds: result.timeSpent,
      score,
      answers: [],
      interactionData: result,
      status: result.correctAnswers >= result.totalQuestions / 2 ? 'completed' : 'in_progress',
    });

    return this.learningRecordRepository.save(record);
  }

  private async resolveContentId(gameId: string): Promise<number> {
    const domain = this.getGameDomain(gameId);
    const content = await this.contentRepository.findOne({
      where: { domain, status: 'published' } as any,
      order: { id: 'ASC' },
    });
    return content?.id ?? 1;
  }

  /**
   * 闯关模式 - 获取关卡
   */
  getLevelInfo(userId: number) {
    // 简化实现：返回固定关卡
    return {
      currentLevel: 1,
      totalLevels: 10,
      exp: 1500,
      nextLevelExp: 2000,
      badges: [
        { id: 'beginner', name: '新手入门', earned: true },
        { id: 'explorer', name: '探索达人', earned: true },
        { id: 'master', name: '大师级', earned: false },
      ],
    };
  }

  // ============ 游戏生成器 ============

  private generateColorMatch(difficulty: number) {
    const colors = [
      { name: '红色', emoji: '🔴' },
      { name: '蓝色', emoji: '🔵' },
      { name: '黄色', emoji: '🟡' },
      { name: '绿色', emoji: '🟢' },
      { name: '紫色', emoji: '🟣' },
      { name: '橙色', emoji: '🟠' },
    ];

    const pairCount = Math.min(2 + difficulty, 4);
    const shuffled = [...colors].sort(() => Math.random() - 0.5).slice(0, pairCount);
    const targets = [...shuffled].sort(() => Math.random() - 0.5);

    // Add IDs to the items
    const itemsWithId = shuffled.map(c => ({ ...c, id: Math.random().toString(36).substr(2, 9) }));

    return {
      gameType: 'match',
      title: '颜色配对',
      instruction: '找出相同的颜色',
      items: itemsWithId,
      targets: targets.map((c, i) => ({ ...c, matchId: itemsWithId[i].id })),
      timeLimit: 60,
    };
  }

  private generateShapeMatch(difficulty: number) {
    const shapes = [
      { name: '圆形', emoji: '⭕' },
      { name: '方形', emoji: '⬜' },
      { name: '三角形', emoji: '🔺' },
      { name: '心形', emoji: '❤️' },
      { name: '星星', emoji: '⭐' },
    ];

    const pairCount = Math.min(2 + difficulty, 3);
    const shuffled = [...shapes].sort(() => Math.random() - 0.5).slice(0, pairCount);
    const targets = [...shuffled].sort(() => Math.random() - 0.5);

    // Add IDs to the items
    const itemsWithId = shuffled.map(s => ({ ...s, id: Math.random().toString(36).substr(2, 9) }));

    return {
      gameType: 'match',
      title: '形状配对',
      instruction: '找出相同的形状',
      items: itemsWithId,
      targets: targets.map((s, i) => ({ ...s, matchId: itemsWithId[i].id })),
      timeLimit: 60,
    };
  }

  private generateAnimalQuiz(difficulty: number) {
    const animals = [
      { name: '小狗', sound: '汪汪', emoji: '🐕' },
      { name: '小猫', sound: '喵喵', emoji: '🐱' },
      { name: '小牛', sound: '哞哞', emoji: '🐮' },
      { name: '小羊', sound: '咩咩', emoji: '🐑' },
      { name: '小鸡', sound: '咯咯', emoji: '🐔' },
      { name: '小鸭', sound: '嘎嘎', emoji: '🦆' },
    ];

    const questions: QuizQuestion[] = [];
    const used = new Set<string>();

    for (let i = 0; i < 3 + difficulty; i++) {
      const correct = animals[Math.floor(Math.random() * animals.length)];
      if (used.has(correct.name)) continue;
      used.add(correct.name);

      const others = animals.filter(a => a.name !== correct.name);
      const wrong = others.sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [correct, ...wrong].sort(() => Math.random() - 0.5);

      questions.push({
        question: `${correct.emoji} 发出的是什么声音？`,
        options: options.map(a => a.sound),
        correctAnswer: options.findIndex(a => a.name === correct.name),
      });
    }

    return {
      gameType: 'quiz',
      title: '动物叫声',
      instruction: '听声音猜动物',
      questions,
      timeLimit: 120,
    };
  }

  private generateCountGame(difficulty: number) {
    const maxCount = 3 + difficulty * 2;
    const questions: QuizQuestion[] = [];

    for (let i = 0; i < 5; i++) {
      const count = Math.floor(Math.random() * maxCount) + 1;
      const emoji = '🍎'.repeat(count);
      
      const options = [
        count,
        count + 1,
        count - 1 > 0 ? count - 1 : count + 2,
      ].sort(() => Math.random() - 0.5);

      questions.push({
        question: `数一数有多少个苹果：${emoji}`,
        options: options.map(String),
        correctAnswer: options.indexOf(count),
      });
    }

    return {
      gameType: 'count',
      title: '数一数',
      instruction: '数一数有多少个',
      questions,
      timeLimit: 120,
    };
  }

  private generateWordMatch(difficulty: number) {
    const words = [
      { char: '人', word: '人们' },
      { char: '口', word: '口水' },
      { char: '手', word: '手机' },
      { char: '山', word: '山上' },
      { char: '水', word: '水果' },
    ];

    const pairCount = Math.min(2 + difficulty, 4);
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, pairCount);

    // Add IDs to the items
    const itemsWithId = shuffled.map(w => ({ char: w.char, id: Math.random().toString(36).substr(2, 9) }));

    return {
      gameType: 'match',
      title: '汉字配对',
      instruction: '找出字和词的对应关系',
      items: itemsWithId,
      targets: shuffled.map((w, i) => ({ word: w.word, matchId: itemsWithId[i].id })),
      timeLimit: 90,
    };
  }

  private generateMathQuiz(difficulty: number) {
    const questions: QuizQuestion[] = [];
    const maxNum = 5 + difficulty * 5;

    for (let i = 0; i < 5; i++) {
      const a = Math.floor(Math.random() * maxNum) + 1;
      const b = Math.floor(Math.random() * maxNum) + 1;
      const isAdd = Math.random() > 0.5;
      
      const correct = isAdd ? a + b : a - b;
      const operator = isAdd ? '+' : '-';
      
      const wrongAnswers = new Set<number>();
      while (wrongAnswers.size < 3) {
        const wrong = correct + Math.floor(Math.random() * 5) - 2;
        if (wrong !== correct && wrong >= 0) wrongAnswers.add(wrong);
      }

      const options = [correct, ...wrongAnswers].sort(() => Math.random() - 0.5);

      questions.push({
        question: `${a} ${operator} ${b} = ?`,
        options: options.map(String),
        correctAnswer: options.indexOf(correct),
      });
    }

    return {
      gameType: 'quiz',
      title: '数学问答',
      instruction: '算一算',
      questions,
      timeLimit: 120,
    };
  }

  private generateSequence(difficulty: number) {
    const sequences = [
      { pattern: [1, 2, 1, 2, '?'], answer: 1, options: [1, 2, 3] },
      { pattern: [1, 2, 3, 1, 2, '?'], answer: 3, options: [1, 2, 3] },
      { pattern: [2, 4, 6, '?'], answer: 8, options: [6, 8, 10] },
      { pattern: ['🔴', '🔵', '🔴', '🔵', '?'], answer: '🔴', options: ['🔴', '🔵', '🟡'] },
    ];

    const selected = sequences.slice(0, 2 + difficulty);

    return {
      gameType: 'sequence',
      title: '找规律',
      instruction: '找出下一个是什么',
      questions: selected.map((s: { pattern: (string | number)[]; answer: string | number; options: (string | number)[] }) => ({
        question: s.pattern.join(' '),
        options: s.options.map(String),
        correctAnswer: s.options.indexOf(s.answer),
      })),
      timeLimit: 120,
    };
  }

  private generateRiddle(difficulty: number) {
    const riddles = [
      { question: '什么动物喵喵叫？', answer: '小猫', options: ['小狗', '小猫', '小牛'] },
      { question: '什么花向日葵？', answer: '向日葵', options: ['玫瑰', '向日葵', '菊花'] },
      { question: '什么水果红又红？', answer: '苹果', options: ['苹果', '香蕉', '葡萄'] },
      { question: '什么球是圆的？', answer: '足球', options: ['篮球', '足球', '排球'] },
      { question: '什么动物有长鼻子？', answer: '大象', options: ['大象', '长颈鹿', '老虎'] },
    ];

    const selected = riddles.slice(0, 2 + difficulty);

    return {
      gameType: 'riddle',
      title: '猜谜语',
      instruction: '猜猜看是什么',
      questions: selected.map(r => ({
        question: r.question,
        options: r.options,
        correctAnswer: r.options.indexOf(r.answer),
      })),
      timeLimit: 120,
    };
  }

  private getGameDomain(gameId: string): string {
    const domainMap: Record<string, string> = {
      'color_match': 'art',
      'shape_match': 'math',
      'animal_sound': 'language',
      'count_simple': 'math',
      'word_match': 'language',
      'math_quiz': 'math',
      'sequence': 'math',
      'riddle': 'language',
    };
    return domainMap[gameId] || 'other';
  }
}