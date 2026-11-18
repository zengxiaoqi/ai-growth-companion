import { Injectable, Logger } from '@nestjs/common';
import { VoiceService } from './voice.service';

export type ReadAloudChar = { char: string; status: 'read' | 'missed' };

export type ReadAloudScore = {
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  chars: ReadAloudChar[];
  missedWords: string[];
};

export type ReadAloudEvaluation = ReadAloudScore & {
  recognizedText: string;
  feedback: string;
  fluencyNote?: string;
  feedbackAudio?: string;
};

/** 只留汉字/字母/数字：标点、空格、emoji 不参与对齐 */
export function normalizeForAlignment(text: string): string {
  return (text || '').toLowerCase().replace(/[^一-鿿a-z0-9]/g, '');
}

/**
 * 字级 LCS 对齐：识别文本可能漏字/多字/错字，LCS 找出"读到的字"，
 * 其余标 missed。评分与识别来源解耦——设备端/浏览器/服务端 STT 都喂这里。
 */
export function scoreReadAloud(targetText: string, recognizedText: string): ReadAloudScore {
  const target = Array.from(normalizeForAlignment(targetText));
  const recognized = Array.from(normalizeForAlignment(recognizedText));
  const n = target.length;
  const m = recognized.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] =
        target[i - 1] === recognized[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const matched = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (target[i - 1] === recognized[j - 1] && dp[i][j] === dp[i - 1][j - 1] + 1) {
      matched[i - 1] = true;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const hit = dp[n][m];
  const accuracy = n > 0 ? hit / n : 0;
  const stars: 0 | 1 | 2 | 3 =
    m === 0 ? 0 : accuracy >= 0.85 ? 3 : accuracy >= 0.6 ? 2 : 1;

  const chars: ReadAloudChar[] = target.map((char, idx) => ({
    char,
    status: matched[idx] ? 'read' : 'missed',
  }));

  const missedWords: string[] = [];
  let run = '';
  for (const c of chars) {
    if (c.status === 'missed') {
      run += c.char;
    } else if (run) {
      missedWords.push(run);
      run = '';
    }
  }
  if (run) missedWords.push(run);

  return { accuracy, stars, chars, missedWords: missedWords.slice(0, 3) };
}

@Injectable()
export class ReadAloudService {
  private readonly logger = new Logger(ReadAloudService.name);

  constructor(private readonly voiceService: VoiceService) {}

  async evaluate(args: {
    targetText: string;
    recognizedText?: string;
    ageGroup?: string;
    durationMs?: number;
  }): Promise<ReadAloudEvaluation> {
    const recognizedText = args.recognizedText || '';
    const score = scoreReadAloud(args.targetText, recognizedText);
    const feedback = this.buildFeedback(score);
    const fluencyNote = this.buildFluencyNote(score, args.durationMs, args.ageGroup);

    let feedbackAudio: string | undefined;
    try {
      feedbackAudio = (await this.voiceService.textToSpeech(feedback)).toString('base64');
    } catch (error: any) {
      this.logger.warn(`read-aloud feedback TTS failed (non-fatal): ${error?.message || 'unknown'}`);
    }

    return { ...score, recognizedText, feedback, fluencyNote, feedbackAudio };
  }

  private buildFeedback(score: ReadAloudScore): string {
    const missed = score.missedWords.join('、');
    switch (score.stars) {
      case 3:
        return '太棒了！每个字都读对了，你读得越来越好听啦！';
      case 2:
        return missed
          ? `大部分都读对啦！我们把「${missed}」再慢慢读一遍，就更棒了。`
          : '大部分都读对啦！再读一遍，会更棒。';
      case 1:
        return missed
          ? `你读对了一部分，很好的开始！「${missed}」有点难，先听示范，再试一次吧。`
          : '很好的开始！先听一遍示范，再跟着读一次吧。';
      default:
        return '刚才没听清，没关系，大声地再读一遍吧！';
    }
  }

  private buildFluencyNote(
    score: ReadAloudScore,
    durationMs?: number,
    ageGroup?: string,
  ): string | undefined {
    if (!durationMs || durationMs <= 0 || score.stars === 0 || score.chars.length === 0) {
      return undefined;
    }
    const perCharMs = ageGroup === '3-4' ? 420 : 360;
    const ratio = durationMs / (score.chars.length * perCharMs);
    if (ratio < 0.45) return '读得有点快，慢慢读，把每个字读清楚。';
    if (ratio > 2.2) return '不着急，一个字一个字读清楚就好。';
    return undefined;
  }
}