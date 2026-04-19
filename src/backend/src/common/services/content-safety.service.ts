import { Injectable } from "@nestjs/common";

/**
 * Content safety service that filters AI responses to ensure
 * child-appropriate, positive, and educational content.
 */
@Injectable()
export class ContentSafetyService {
  // Prohibited words/topics - violence, fear, inappropriate content
  private readonly prohibitedWords: string[] = [
    // Violence & harm
    "杀",
    "打",
    "砍",
    "刺",
    "血",
    "死",
    "暴",
    "枪",
    "刀",
    "毒",
    "伤害",
    "攻击",
    "战斗",
    "武器",
    "炸弹",
    "谋杀",
    "复仇",
    // Fear & horror
    "鬼",
    "魔",
    "噩梦",
    "恐怖",
    "惊悚",
    "幽灵",
    "诅咒",
    // Inappropriate
    "赌博",
    "酗酒",
    "吸毒",
    "偷窃",
    "犯罪",
    "监狱",
    // Personal info patterns
    "密码",
    "身份证",
    "银行卡",
    "地址是",
  ];

  // Personal information patterns to redact
  private readonly piiPatterns: RegExp[] = [
    /\d{11}/g, // Phone numbers
    /\d{17}[\dXx]/g, // ID numbers
    /密码[是为：:\s]+\S+/g,
  ];

  /**
   * Filter content through safety checks.
   * Returns sanitized content and a flag indicating if content was modified.
   */
  filterContent(content: string): { content: string; wasFiltered: boolean } {
    if (!content || typeof content !== "string") {
      return { content: content || "", wasFiltered: false };
    }

    let filtered = content;
    let wasFiltered = false;

    // Check for prohibited words
    for (const word of this.prohibitedWords) {
      if (filtered.includes(word)) {
        filtered = filtered.replace(new RegExp(word, "g"), "***");
        wasFiltered = true;
      }
    }

    // Redact PII patterns
    for (const pattern of this.piiPatterns) {
      const newFiltered = filtered.replace(pattern, "[已隐藏]");
      if (newFiltered !== filtered) {
        filtered = newFiltered;
        wasFiltered = true;
      }
    }

    // Ensure positive tone - if content was flagged, append encouragement
    if (wasFiltered) {
      filtered = filtered + "\n\n🌈 让我们一起学习美好的事物吧！";
    }

    return { content: filtered, wasFiltered };
  }

  /**
   * Check if content is safe (no prohibited content detected).
   */
  isContentSafe(content: string): boolean {
    if (!content || typeof content !== "string") {
      return true;
    }

    for (const word of this.prohibitedWords) {
      if (content.includes(word)) {
        return false;
      }
    }

    for (const pattern of this.piiPatterns) {
      if (pattern.test(content)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filter a structured story response.
   */
  filterStoryResponse(story: {
    title: string;
    content: string;
    questions: string[];
  }): typeof story {
    const titleResult = this.filterContent(story.title);
    const contentResult = this.filterContent(story.content);
    const filteredQuestions = story.questions.map(
      (q) => this.filterContent(q).content,
    );

    return {
      title: titleResult.content,
      content: contentResult.content,
      questions: filteredQuestions,
    };
  }
}
