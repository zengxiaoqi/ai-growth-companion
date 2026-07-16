import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Poem } from './entities/poem.entity';

/** 填字游戏题目 */
export interface FillBlankQuestion {
  poemId: number;
  title: string;
  author: string;
  dynasty: string;
  fullContent: string;
  blankedContent: string;
  blanks: { position: number; answer: string }[];
}

/** 飞花令题目 */
export interface FlyingFlowerQuestion {
  char: string;
  poems: {
    id: number;
    title: string;
    author: string;
    line: string;
  }[];
}

@Injectable()
export class PoetryGameService {
  constructor(
    @InjectRepository(Poem, 'poetry')
    private poemRepository: Repository<Poem>,
  ) {}

  /**
   * 生成填字游戏题目
   * 从诗词中随机隐藏若干字
   */
  async generateFillBlank(difficulty: 'easy' | 'medium' | 'hard' = 'medium'): Promise<FillBlankQuestion | null> {
    // 随机获取一首诗
    const poem = await this.poemRepository
      .createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty')
      .orderBy('RANDOM()')
      .limit(1)
      .getOne();

    if (!poem) return null;

    const content = poem.content;
    // 提取所有汉字（排除标点）
    const chars = content.split('').filter(c => /[\u4e00-\u9fa5]/.test(c));
    
    if (chars.length < 5) return null;

    // 根据难度决定隐藏字数
    const blankCount = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 4 : 6;
    const actualBlankCount = Math.min(blankCount, Math.floor(chars.length / 3));

    // 随机选择要隐藏的位置
    const positions: number[] = [];
    const contentChars = content.split('');
    const charIndices: number[] = [];
    
    // 找到所有汉字的位置
    contentChars.forEach((c, i) => {
      if (/[\u4e00-\u9fa5]/.test(c)) charIndices.push(i);
    });

    // 随机选择
    while (positions.length < actualBlankCount && charIndices.length > 0) {
      const idx = Math.floor(Math.random() * charIndices.length);
      positions.push(charIndices[idx]);
      charIndices.splice(idx, 1);
    }
    positions.sort((a, b) => a - b);

    // 生成带空白的内容
    const blanks: { position: number; answer: string }[] = [];
    let blankedContent = content;
    
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i];
      const answer = content[pos];
      blanks.unshift({ position: pos, answer });
      blankedContent = blankedContent.substring(0, pos) + '＿' + blankedContent.substring(pos + 1);
    }

    return {
      poemId: poem.id,
      title: poem.title,
      author: poem.author?.name || '佚名',
      dynasty: poem.dynasty?.name || '',
      fullContent: content,
      blankedContent,
      blanks,
    };
  }

  /**
   * 飞花令 - 获取包含指定字的诗句
   */
  async getFlyingFlower(char?: string): Promise<FlyingFlowerQuestion | null> {
    // 常用飞花令字
    const commonChars = ['月', '花', '风', '雪', '春', '秋', '山', '水', '云', '雨', '日', '夜'];
    const targetChar = char || commonChars[Math.floor(Math.random() * commonChars.length)];

    // 查找包含该字的诗词
    const poems = await this.poemRepository
      .createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .where('poem.content LIKE :char', { char: `%${targetChar}%` })
      .orderBy('RANDOM()')
      .limit(10)
      .getMany();

    if (poems.length === 0) return null;

    const results = poems.map(poem => {
      // 找到包含该字的那一行
      const lines = poem.content.split('\n');
      const matchingLine = lines.find(line => line.includes(targetChar)) || lines[0];
      
      return {
        id: poem.id,
        title: poem.title,
        author: poem.author?.name || '佚名',
        line: matchingLine,
      };
    });

    return {
      char: targetChar,
      poems: results,
    };
  }

  /**
   * 诗词接龙 - 上一句的最后一个字是下一句的第一个字
   */
  async getSolitaire(lastChar?: string): Promise<{ poem: any; line: string; prevLine: string } | null> {
    let query = this.poemRepository
      .createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty');

    if (lastChar) {
      query = query.where('poem.content LIKE :char', { char: `${lastChar}%` });
    }

    const poem = await query.orderBy('RANDOM()').limit(1).getOne();
    if (!poem) return null;

    const lines = poem.content.split('\n').filter(l => l.trim());
    const firstLine = lines[0] || '';
    const secondLine = lines[1] || '';

    return {
      poem: {
        id: poem.id,
        title: poem.title,
        author: poem.author?.name,
        dynasty: poem.dynasty?.name,
      },
      prevLine: lastChar ? `${lastChar}${firstLine.slice(1)}` : firstLine,
      line: secondLine,
    };
  }
}
