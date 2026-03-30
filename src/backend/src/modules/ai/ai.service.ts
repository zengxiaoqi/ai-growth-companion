import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ContentSafetyService } from '../../common/services/content-safety.service';

/** Age group classification for adaptive dialogue */
type AgeGroup = '3-4' | '5-6' | 'unknown';

@Injectable()
export class AiService {
  // Age-adaptive prompt templates
  private readonly agePromptTemplates = {
    '3-4': {
      prefix: '哇！',
      suffix: ' 🌟✨',
      encouragements: [
        '太棒了！🌟',
        '你真聪明！🎉',
        '好厉害呀！👏',
        '哇！你好棒！🥰',
        '太好了！🌈',
      ],
      followUp: [
        '你还想知道什么呢？😊',
        '我们再来玩一个游戏吧！🎮',
        '你还能想到什么呀？🤔',
      ],
      style: 'very_simple' as const,
    },
    '5-6': {
      prefix: '',
      suffix: '',
      encouragements: [
        '说得很好！让我们来深入了解吧~',
        '你学得真快！可以再想想这个问题吗？',
        '太好了！这个问题很有趣，我们一起来探索吧~',
        '回答得不错！你知道为什么会这样吗？',
        '你的想法很棒！让我们来验证一下~',
      ],
      followUp: [
        '你能告诉我更多关于这个的知识吗？',
        '你觉得还有什么和这个有关系呢？',
        '我们一起来找找答案吧！',
      ],
      style: 'simple_educational' as const,
    },
    unknown: {
      prefix: '',
      suffix: '',
      encouragements: [
        '太棒了！继续加油~ 🌟',
        '你真聪明！🎉',
        '让我们一起学习吧！📚',
        '太好了，这个问题问得很好！',
        '我喜欢你提出的问题，继续探索吧~ ✨',
      ],
      followUp: [],
      style: 'neutral' as const,
    },
  };

  private defaultResponses = [
    '太棒了！继续加油~ 🌟',
    '你真聪明！🎉',
    '让我们一起学习吧！📚',
    '太好了，这个问题问得很好！',
    '我喜欢你提出的问题，继续探索吧~ ✨',
  ];

  constructor(
    private readonly usersService: UsersService,
    private readonly contentSafetyService: ContentSafetyService,
  ) {}

  /** Classify a numeric age into an age group */
  private classifyAge(age: number | undefined | null): AgeGroup {
    if (age == null) return 'unknown';
    if (age >= 3 && age <= 4) return '3-4';
    if (age >= 5 && age <= 6) return '5-6';
    return 'unknown';
  }

  /** Look up a user's age from the Users service */
  private async getUserAge(childId: number | undefined): Promise<number | null> {
    if (!childId) return null;
    try {
      const user = await this.usersService.findById(childId);
      return user?.age ?? null;
    } catch {
      return null;
    }
  }

  async chat(
    message: string,
    context: any,
    history: any[] = [],
    childId?: number,
  ) {
    // Resolve age: explicit > context > user lookup
    let age: number | undefined | null = context?.age;
    if (age == null && childId) {
      age = await this.getUserAge(childId);
    }
    const ageGroup = this.classifyAge(age);
    const template = this.agePromptTemplates[ageGroup];

    // Select base response
    const idx = message.length % template.encouragements.length;
    let response = template.encouragements[idx];

    // Apply age-adaptive styling
    if (template.style === 'very_simple') {
      // 3-4: Very simple, emoji-rich, prefix with excitement
      response = template.prefix + response + template.suffix;
      const followUp = template.followUp[message.length % template.followUp.length];
      response = response + ' ' + followUp;
    } else if (template.style === 'simple_educational') {
      // 5-6: Slightly more complex, ask follow-up questions
      const followUp = template.followUp[message.length % template.followUp.length];
      response = response + ' ' + followUp;
    }

    // Run content through safety filter
    const safe = this.contentSafetyService.filterContent(response);

    return { response: safe.content };
  }

  /**
   * Generate an age-appropriate educational story.
   */
  async generateStory(params: {
    childId: number;
    theme?: string;
    ageRange?: '3-4' | '5-6';
  }): Promise<{ title: string; content: string; questions: string[] }> {
    const { childId, theme, ageRange } = params;

    // Resolve age group
    let resolvedAgeGroup: AgeGroup = ageRange ?? 'unknown';
    if (!ageRange) {
      const userAge = await this.getUserAge(childId);
      resolvedAgeGroup = this.classifyAge(userAge);
    }

    const storyTopic = theme ?? '友谊与分享';

    // Age-appropriate story templates
    const story = this.buildStory(storyTopic, resolvedAgeGroup);

    // Run through safety filter
    return this.contentSafetyService.filterStoryResponse(story);
  }

  private buildStory(
    topic: string,
    ageGroup: AgeGroup,
  ): { title: string; content: string; questions: string[] } {
    if (ageGroup === '3-4') {
      return {
        title: `小兔子的${topic}故事 🐰`,
        content:
          `从前，有一只可爱的小兔子🐰。` +
          `小兔子最喜欢和朋友一起玩！有一天，小兔子学习了关于"${topic}"的事情。` +
          `小兔子说："哇！${topic}好好玩呀！"🌟\n\n` +
          `小兔子把学到的东西分享给了好朋友小熊🐻。` +
          `小熊说："谢谢你，小兔子！你真棒！"🎉\n\n` +
          `小兔子开心地笑了，因为它学到了新东西，还和好朋友分享了！太棒了！🌈`,
        questions: [
          '小兔子学了什么呀？🐰',
          '小兔子把学到的东西分享给了谁？',
          '你觉得小兔子开心吗？为什么呢？😊',
        ],
      };
    }

    if (ageGroup === '5-6') {
      return {
        title: `探索${topic}的奇妙之旅 🌍`,
        content:
          `在一个美丽的小镇上，住着一群爱学习的好朋友。` +
          `有一天，他们决定一起去探索"${topic}"的奥秘。\n\n` +
          `他们首先发现了关于${topic}的很多有趣的知识。` +
          `小明说："原来${topic}有这么多我们不知道的秘密！" ` +
          `小红说："是呀！我觉得我们还能发现更多呢。"\n\n` +
          `经过认真的观察和思考，他们终于弄明白了${topic}的原理。` +
          `大家都非常高兴，因为他们通过自己的努力学到了新知识。\n\n` +
          `回家的路上，小明说："学习真有趣！下次我们再一起探索新的知识吧！" ` +
          `大家都开心地点了点头。🌟`,
        questions: [
          `故事里的小朋友们探索了什么？`,
          `他们是怎么发现${topic}的秘密的？`,
          `如果是你，你会怎么去探索${topic}呢？`,
          `你从故事中学到了什么道理？`,
        ],
      };
    }

    // Unknown age - neutral story
    return {
      title: `${topic}的故事`,
      content:
        `在一个遥远的森林里，住着一只可爱的小动物。有一天，它遇到了关于"${topic}"的有趣事情。` +
        `经过努力探索，它终于明白了${topic}的道理！`,
      questions: [`关于${topic}，你学到了什么？`],
    };
  }

  async evaluateLearning(contentId: number, answers: any[], age: number) {
    // Simple scoring logic
    const correctCount = answers.filter((a, i) => i % 2 === 0).length;
    const score = Math.round((correctCount / answers.length) * 100);

    let feedback: string;
    if (score >= 80) {
      feedback = '你做得太棒了！';
    } else if (score >= 60) {
      feedback = '不错哦，继续加油！';
    } else {
      feedback = '再接再厉哦~';
    }

    // Run through safety filter
    const safe = this.contentSafetyService.filterContent(feedback);

    return {
      score,
      feedback: safe.content,
      stars: score >= 80 ? 3 : score >= 60 ? 2 : 1,
    };
  }

  async generateSuggestion(abilities: any, age: number) {
    const suggestions = [
      '今天表现很棒！明天我们继续加油~',
      '语言方面有进步！可以多听听故事哦~',
      '数学思维越来越好了！继续做游戏吧~',
      '今天学了很多新知识，太厉害了！',
    ];
    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    const safe = this.contentSafetyService.filterContent(suggestion);
    return { suggestion: safe.content };
  }

  /**
   * Legacy story generation - kept for backward compatibility.
   * Used by POST /ai/generate-story.
   */
  async generateStoryLegacy(topic: string, age: number) {
    const stories = {
      short: `从前有一只小动物，它${topic}...最后它学到了...`,
      medium: `在一个遥远的森林里，住着一只可爱的小动物。有一天，它遇到了${topic}的挑战...经过努力，它终于成功了！这个故事告诉我们...`,
    };

    const content = age < 4 ? stories.short : stories.medium;
    const safe = this.contentSafetyService.filterContent(content);
    const safeTitle = this.contentSafetyService.filterContent(`${topic}的故事`);

    return {
      title: safeTitle.content,
      content: safe.content,
      duration: age < 4 ? 3 : 5,
    };
  }
}