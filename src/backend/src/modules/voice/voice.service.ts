import { Injectable } from "@nestjs/common";
import { EdgeTTS } from "@andresaya/edge-tts";

@Injectable()
export class VoiceService {
  /**
   * 文字转语音 - 使用 Edge-TTS
   * 返回 MP3 音频 Buffer
   */
  async textToSpeech(
    text: string,
    voice: string = "zh-CN-XiaoxiaoNeural",
  ): Promise<Buffer> {
    const tts = new EdgeTTS();
    await tts.synthesize(text, voice, {
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
    });
    return tts.toBuffer();
  }

  // ============ 以下保留原有功能，TTS 部分改用 Edge-TTS ============

  async speechToText(audioUrl: string) {
    return "模拟识别结果：你好";
  }

  async voiceChat(userId: number, audioUrl: string) {
    const text = await this.speechToText(audioUrl);
    const intent = this.parseIntent(text);
    const reply = this.generateReply(intent, text);
    const audioBuffer = await this.textToSpeech(reply.text);
    return {
      query: text,
      intent,
      reply: reply.text,
      suggestions: reply.suggestions,
      audioBuffer: audioBuffer.toString("base64"),
      duration: Math.ceil(reply.text.length / 3),
    };
  }

  async generateStory(userId: number, theme: string, ageRange: string) {
    const storyLength = ageRange === "3-4" ? "短" : "中";
    const story = this.generateStoryContent(theme, storyLength);
    const audioBuffer = await this.textToSpeech(story.content);
    return {
      title: story.title,
      content: story.content,
      duration: Math.ceil(story.content.length / 3),
      audioBuffer: audioBuffer.toString("base64"),
      keywords: story.keywords,
    };
  }

  async getNurseryRhyme(rhymeId?: string) {
    const rhymes = [
      {
        id: "1",
        title: "小星星",
        content:
          "一闪一闪亮晶晶，满天都是小星星。挂在天上放光明，好像许多小眼睛。",
        emoji: "⭐",
      },
      {
        id: "2",
        title: "小白船",
        content: "蓝蓝的天空银河里，有只小白船。船上有棵桂花树，白兔在游玩。",
        emoji: "🌙",
      },
      {
        id: "3",
        title: "小燕子",
        content:
          "小燕子穿花衣，年年春天来这里。我问燕子你为啥来，燕子说这里的春天最美丽。",
        emoji: "🐦",
      },
      {
        id: "4",
        title: "数鸭子",
        content: "门前大桥下，游过一群鸭。快来快来数一数，二四六七八。",
        emoji: "🦆",
      },
      {
        id: "5",
        title: "拔萝卜",
        content: "拔萝卜拔萝卜，嗨哟嗨哟拔不动。老婆婆快来帮我们拔萝卜。",
        emoji: "🥕",
      },
    ];

    if (rhymeId) {
      const rhyme = rhymes.find((r) => r.id === rhymeId);
      if (rhyme) {
        const buf = await this.textToSpeech(rhyme.content);
        return {
          ...rhyme,
          audioBuffer: buf.toString("base64"),
          duration: Math.ceil(rhyme.content.length / 3),
        };
      }
    }

    const selected = await Promise.all(
      rhymes.map(async (r) => {
        const buf = await this.textToSpeech(r.content);
        return {
          ...r,
          audioBuffer: buf.toString("base64"),
          duration: Math.ceil(r.content.length / 3),
        };
      }),
    );
    return selected;
  }

  async voiceQuiz(userId: number, question: string) {
    const quizzes = this.getVoiceQuizzes();
    const matched = quizzes.find(
      (q) =>
        question.includes(q.keywords[0]) || question.includes(q.keywords[1]),
    );

    const reply = matched
      ? matched.answer
      : "这个问题真有趣！让我想想怎么回答你...";
    const buf = await this.textToSpeech(reply);
    return {
      question: matched?.question || question,
      answer: reply,
      audioBuffer: buf.toString("base64"),
      duration: Math.ceil(reply.length / 3),
    };
  }

  private parseIntent(text: string): string {
    const intents = [
      { keywords: ["什么", "谁", "哪里", "为什么"], type: "question" },
      { keywords: ["故事", "讲", "听"], type: "story" },
      { keywords: ["歌", "唱", "儿歌"], type: "song" },
      { keywords: ["游戏", "玩"], type: "game" },
    ];
    for (const intent of intents) {
      if (intent.keywords.some((k) => text.includes(k))) return intent.type;
    }
    return "chat";
  }

  private generateReply(intent: string, text: string) {
    const replies: Record<string, { text: string; suggestions: string[] }> = {
      question: {
        text: "你问的问题真棒！让我来告诉你...",
        suggestions: ["给我讲个故事吧", "唱首儿歌", "我们玩游戏"],
      },
      story: {
        text: "好的，我来给你讲一个有趣的故事...",
        suggestions: ["再讲一个", "我想听儿歌", "玩游戏"],
      },
      song: {
        text: "让我为你唱一首好听的儿歌...",
        suggestions: ["小星星", "小白船", "讲故事"],
      },
      game: {
        text: "我们来玩一个有趣的游戏吧！",
        suggestions: ["颜色配对", "数学问答", "找规律"],
      },
      chat: {
        text: "和你聊天真开心！",
        suggestions: ["讲故事", "唱儿歌", "玩游戏"],
      },
    };
    return replies[intent] || replies.chat;
  }

  private generateStoryContent(theme: string, length: string) {
    const stories: Record<
      string,
      { title: string; content: string; keywords: string[] }
    > = {
      动物: {
        title: "小兔子的冒险",
        content:
          '有一天，小兔子蹦蹦跳跳地去森林里玩。它遇到了小鸟，小鸟说："你好呀！"小兔子说："你好！"它们一起玩耍，成为了好朋友。天黑了，它们依依不舍地告别，约好明天再来玩。',
        keywords: ["兔子", "森林", "朋友"],
      },
      自然: {
        title: "春天的故事",
        content:
          '春天来了，花儿开了，草儿绿了。小燕子从南方飞回来了。小熊从冬眠中醒来，伸了个懒腰，开心地说："春天真好！"',
        keywords: ["春天", "花", "燕子"],
      },
      亲情: {
        title: "妈妈的爱",
        content:
          '小熊醒来，发现妈妈不在身边。它找呀找，看见妈妈在厨房做饭。妈妈说："快来吃早餐啦！"小熊抱住妈妈说："妈妈，我爱你！"',
        keywords: ["妈妈", "爱", "早餐"],
      },
    };
    return stories[theme] || stories["动物"];
  }

  private getVoiceQuizzes() {
    return [
      {
        keywords: ["狗", "小狗"],
        question: "小狗怎么叫？",
        answer: "小狗汪汪叫！",
      },
      {
        keywords: ["猫", "小猫"],
        question: "小猫怎么叫？",
        answer: "小猫喵喵叫！",
      },
      {
        keywords: ["太阳", "白天"],
        question: "什么时候有太阳？",
        answer: "白天有太阳！",
      },
      {
        keywords: ["月亮", "晚上"],
        question: "什么时候有月亮？",
        answer: "晚上有月亮！",
      },
      {
        keywords: ["一加一", "1+1"],
        question: "一加一等于几？",
        answer: "一加一等于二！",
      },
    ];
  }
}
