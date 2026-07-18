import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as OpenCC from 'opencc-js';
import { Poem } from './entities/poem.entity';

// Converter instances
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' });
const t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });

function convertText(text: string | null | undefined, lang?: string): string | null {
  if (!text || !lang) return text ?? null;
  if (lang === 'zh-Hans') return t2sConverter(text);
  if (lang === 'zh-Hant') return s2tConverter(text);
  return text;
}

/** 填字游戏题目 */
export interface FillBlankQuestion {
  poemId: number;
  title: string;
  authorName: string;
  dynastyName: string;
  lines: string[];
  blankIndices: number[];
  answers: string[];
  candidates: string[];
  appreciation: string | null;
}

/** 飞花令题目 */
export interface FlyingFlowerEntry {
  poemId: number;
  title: string;
  authorName: string;
  dynastyName: string;
  line: string;
  fullContent: string;
}

export interface FlyingFlowerQuestion {
  keyword: string;
  entries: FlyingFlowerEntry[];
}

/** 诗词接龙题目 */
export interface SolitaireQuestion {
  poemId: number;
  title: string;
  authorName: string;
  dynastyName: string;
  currentLine: string;
  options: string[];
  correctIndex: number;
}

/** Fisher-Yates shuffle in-place */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class PoetryGameService {
  constructor(
    @InjectRepository(Poem, 'poetry')
    private poemRepository: Repository<Poem>,
  ) {}

  /**
   * 填字游戏 - 随机挖空诗句
   */
  async generateFillBlank(
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    lang?: string,
  ): Promise<FillBlankQuestion | null> {
    const chineseRe = /[\u4e00-\u9fa5]/;

    for (let attempt = 0; attempt < 3; attempt++) {
      const poem = await this.poemRepository
        .createQueryBuilder('poem')
        .leftJoinAndSelect('poem.author', 'author')
        .leftJoinAndSelect('poem.dynasty', 'dynasty')
        .orderBy('RANDOM()')
        .limit(1)
        .getOne();

      if (!poem) return null;

      const content = poem.content;
      // Collect Chinese-char positions in the raw content string
      const positions: number[] = [];
      for (let i = 0; i < content.length; i++) {
        if (chineseRe.test(content[i])) positions.push(i);
      }

      if (positions.length < 5) continue;

      const maxBlanks = Math.floor(positions.length / 3);
      const baseCount = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 5;
      const blankCount = Math.min(baseCount, maxBlanks);

      // Randomly select blank positions
      const pool = [...positions];
      const chosen: number[] = [];
      for (let i = 0; i < blankCount && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        chosen.push(pool[idx]);
        pool.splice(idx, 1);
      }
      chosen.sort((a, b) => a - b);

      // Build answers array
      const answers = chosen.map((pos) => content[pos]);

      // Split into lines (preserve all lines for frontend rendering)
      const lines = content.split('\n').filter((l) => l.length > 0 || true);

      // Candidates: answers + distractors (other unique Chinese chars in the poem)
      const chineseChars = positions.map((p) => content[p]);
      const distinctChars = [...new Set(chineseChars)];
      const distractors = distinctChars.filter((c) => !answers.includes(c));
      const shuffledDistractors = shuffle(distractors);
      const candidates = shuffle([...answers, ...shuffledDistractors.slice(0, 6)]);

      return {
        poemId: poem.id,
        title: convertText(poem.title, lang) ?? '',
        authorName: convertText(poem.author?.name || '佚名', lang) ?? '佚名',
        dynastyName: convertText(poem.dynasty?.name || '', lang) ?? '',
        lines: lines.map((l) => convertText(l, lang) ?? l),
        blankIndices: chosen,
        answers: answers.map((a) => convertText(a, lang) ?? a),
        candidates: candidates.map((c) => convertText(c, lang) ?? c),
        appreciation: null,
      };
    }

    return null;
  }

  /**
   * 飞花令 - 获取包含指定关键字的诗句
   */
  async getFlyingFlower(keyword?: string, lang?: string): Promise<FlyingFlowerQuestion | null> {
    const commonKeywords = ['月', '花', '风', '雪', '春', '秋', '山', '水', '云', '雨', '日', '夜'];
    const targetKeyword =
      keyword || commonKeywords[Math.floor(Math.random() * commonKeywords.length)];

    const poems = await this.poemRepository
      .createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty')
      .where('poem.content LIKE :kw', { kw: `%${targetKeyword}%` })
      .orderBy('RANDOM()')
      .limit(10)
      .getMany();

    if (poems.length === 0) return null;

    const entries = poems.map((poem) => {
      const lines = poem.content.split('\n');
      const line = lines.find((l) => l.includes(targetKeyword)) || lines[0] || '';

      return {
        poemId: poem.id,
        title: convertText(poem.title, lang) ?? '',
        authorName: convertText(poem.author?.name || '佚名', lang) ?? '佚名',
        dynastyName: convertText(poem.dynasty?.name || '', lang) ?? '',
        line: convertText(line, lang) ?? line,
        fullContent: convertText(poem.content, lang) ?? poem.content,
      };
    });

    return {
      keyword: convertText(targetKeyword, lang) ?? targetKeyword,
      entries,
    };
  }

  /**
   * 诗词接龙 - 给出上句，选择正确的下句
   */
  async getSolitaire(lang?: string): Promise<SolitaireQuestion | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const poem = await this.poemRepository
        .createQueryBuilder('poem')
        .leftJoinAndSelect('poem.author', 'author')
        .leftJoinAndSelect('poem.dynasty', 'dynasty')
        .orderBy('RANDOM()')
        .limit(1)
        .getOne();

      if (!poem) return null;

      const lines = poem.content.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length < 2) continue;

      const currentLine = lines[0];
      const correctAnswer = lines[1];

      // Get wrong options from other poems
      const wrongPoems = await this.poemRepository
        .createQueryBuilder('poem')
        .leftJoinAndSelect('poem.author', 'author')
        .leftJoinAndSelect('poem.dynasty', 'dynasty')
        .where('poem.id != :id', { id: poem.id })
        .orderBy('RANDOM()')
        .limit(10)
        .getMany();

      const otherLines: string[] = [];
      for (const otherPoem of wrongPoems) {
        const plines = otherPoem.content.split('\n');
        for (const pl of plines) {
          const trimmed = pl.trim();
          if (trimmed && !otherLines.includes(trimmed) && trimmed !== correctAnswer) {
            otherLines.push(trimmed);
            if (otherLines.length >= 3) break;
          }
        }
        if (otherLines.length >= 3) break;
      }

      if (otherLines.length < 3) continue;

      // Build options with correct answer + wrong options
      const options: string[] = [correctAnswer, ...shuffle(otherLines.slice(0, 3))];

      // Track where correct answer ended up
      const correctIndex = options.indexOf(correctAnswer);

      return {
        poemId: poem.id,
        title: convertText(poem.title, lang) ?? '',
        authorName: convertText(poem.author?.name || '佚名', lang) ?? '佚名',
        dynastyName: convertText(poem.dynasty?.name || '', lang) ?? '',
        currentLine: convertText(currentLine, lang) ?? currentLine,
        options: options.map((o) => convertText(o, lang) ?? o),
        correctIndex,
      };
    }

    return null;
  }
}
