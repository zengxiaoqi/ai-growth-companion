import { Injectable } from '@nestjs/common';

@Injectable()
export class AiService {
  private defaultResponses = [
    '太棒了！继续加油~ 🌟',
    '你真聪明！🎉',
    '让我们一起学习吧！📚',
    '太好了，这个问题问得很好！',
    '我喜欢你提出的问题，继续探索吧~ ✨',
  ];

  async chat(message: string, context: any, history: any[] = []) {
    // 简单的响应生成（实际项目中这里会调用 AI API）
    const age = context?.age || 5;
    let response = this.defaultResponses[message.length % this.defaultResponses.length];
    
    // 根据年龄调整回复
    if (age < 4) {
      response = '哇！你好棒！' + response;
    } else if (age > 5) {
      response = '说得很好！' + response + '我们来深入了解一下吧~';
    }
    
    return { response };
  }

  async generateStory(topic: string, age: number) {
    const stories = {
      short: `从前有一只小动物，它${topic}...最后它学到了...`,
      medium: `在一个遥远的森林里，住着一只可爱的小动物。有一天，它遇到了${topic}的挑战...经过努力，它终于成功了！这个故事告诉我们...`,
    };
    
    return {
      title: `${topic}的故事`,
      content: age < 4 ? stories.short : stories.medium,
      duration: age < 4 ? 3 : 5,
    };
  }

  async evaluateLearning(contentId: number, answers: any[], age: number) {
    // 简单评分逻辑
    const correctCount = answers.filter((a, i) => i % 2 === 0).length;
    const score = Math.round((correctCount / answers.length) * 100);
    
    return {
      score,
      feedback: score >= 80 ? '你做得太棒了！' : '再接再厉哦~',
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
    return { suggestion: suggestions[Math.floor(Math.random() * suggestions.length)] };
  }
}