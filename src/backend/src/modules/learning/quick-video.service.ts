import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';
import { LessonVideoQueueService } from './lesson-video-queue.service';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import type { VideoRenderEngine } from '../../database/entities/video-generation-task.entity';

@Injectable()
export class QuickVideoService {
  private readonly logger = new Logger(QuickVideoService.name);

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly llmClient: LlmClientService,
    private readonly lessonVideoQueue: LessonVideoQueueService,
  ) {}

  /**
   * 根据 topic + ageGroup 生成完整课程内容
   * 返回可直接用于 VideoGenerationAgent 的 payload
   */
  async generateLessonContent(params: {
    topic: string;
    ageGroup: string;
    durationSec?: number;
    style?: string;
  }): Promise<Record<string, any>> {
    const duration = params.durationSec || 60;
    const targetScenes = Math.max(3, Math.min(8, Math.floor(duration / 8)));

    const prompt = this.buildContentPrompt(
      params.topic,
      params.ageGroup,
      targetScenes,
      params.style,
    );

    const result = await this.llmClient.chatCompletion([{ role: 'user', content: prompt }]);

    return this.parseAiResult(result);
  }

  private buildContentPrompt(
    topic: string,
    ageGroup: string,
    targetScenes: number,
    style?: string,
  ): string {
    // 提示词引导 AI 输出结构化的 videoLesson + visualStory
    const styleText =
      style === 'science' ? '科学探索' : style === 'song' ? '音乐儿歌' : '活泼有趣的卡通风格';

    return `你是一个儿童教育内容创作专家。请为 ${ageGroup} 岁的孩子创作一个关于「${topic}」的教学视频内容。

要求：
- 生成 ${targetScenes} 个场景（shots）
- 每个场景包含：标题、旁白文字（中文，适合儿童，每段30-60字）、视觉描述（英文，用于生成动画场景图）、屏幕文字
- 整体时长约 ${targetScenes * 8} 秒
- 风格：${styleText}

请严格按照以下 JSON 格式输出（不要包含其他文字）：

{
  "title": "课程标题（中文，10字以内）",
  "summary": "课程简介（30字以内）",
  "domain": "${style === 'science' ? 'science' : style === 'song' ? 'music' : 'language'}",
  "videoLesson": {
    "shots": [
      {
        "title": "场景标题",
        "narration": "旁白文字（中文）",
        "visualDescription": "visual description in English for animation scene",
        "onScreenText": "屏幕显示文字",
        "durationSec": 8
      }
    ]
  },
  "visualStory": {
    "scenes": [
      {
        "title": "场景标题（同 shots）",
        "narration": "旁白文字",
        "visualDescription": "visual description for animation",
        "onScreenText": "屏幕文字",
        "durationSec": 8,
        "animationTemplate": { "id": "dynamic.story-scene" }
      }
    ]
  }
}`;
  }

  private parseAiResult(result: any): Record<string, any> {
    // 处理 AI 可能返回 markdown 代码块包装的 JSON
    const text = result?.content || JSON.stringify(result);
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const raw = jsonMatch ? jsonMatch[1] : text;
    try {
      return JSON.parse(raw);
    } catch (e) {
      this.logger.warn('AI content parse failed, using fallback structure');
      return this.buildFallbackPayload(result);
    }
  }

  private buildFallbackPayload(aiResult: any): Record<string, any> {
    // fallback: 最小可用的 payload
    return {
      title: '教学视频',
      summary: aiResult?.content?.slice(0, 30) || '自动生成的教学视频',
      domain: 'language',
      videoLesson: {
        shots: [
          {
            title: '教学场景',
            narration: '让我们一起学习吧！',
            visualDescription: 'fun education animation',
            onScreenText: '学习时间',
            durationSec: 6,
          },
        ],
      },
      visualStory: {
        scenes: [
          {
            title: '教学场景',
            narration: '让我们一起学习吧！',
            visualDescription: 'fun education animation',
            onScreenText: '学习时间',
            durationSec: 6,
            animationTemplate: { id: 'dynamic.story-scene' },
          },
        ],
      },
    };
  }

  /**
   * 创建 Content 实体并入队视频生成任务
   */
  async createContentAndEnqueue(params: {
    topic: string;
    ageGroup: string;
    childId: number;
    durationSec?: number;
    style?: string;
    force?: boolean;
    renderEngine?: VideoRenderEngine;
  }) {
    // 1. 检查缓存：同一 topic+ageRange 只生成一次 Content
    const existingContent = await this.contentRepo.findOne({
      where: {
        topic: params.topic,
        ageRange: params.ageGroup,
        domain: 'quick_generate_marker',
      },
      order: { id: 'DESC' },
    } as any);

    let contentId: number;

    if (existingContent && !params.force) {
      this.logger.log(`Reusing existing quick_generate content: id=${existingContent.id}`);
      contentId = existingContent.id;
    } else {
      // 2. AI 生成内容
      const lessonData = await this.generateLessonContent({
        topic: params.topic,
        ageGroup: params.ageGroup,
        durationSec: params.durationSec,
        style: params.style,
      });

      // 3. 创建 Content 实体
      const content = this.contentRepo.create({
        title: lessonData.title || params.topic,
        topic: params.topic,
        ageGroup: params.ageGroup,
        domain: lessonData.domain || 'language',
        summary: lessonData.summary || '',
        source: 'quick_generate',
        // 将 AI 生成的完整数据存入 content 字段（JSON 类型）
        content: lessonData,
        contentStatus: 'published',
        // 其他 Content 实体必需字段
        type: 'video_lesson',
        difficulty: 1,
        durationMinutes: Math.ceil((params.durationSec || 60) / 60),
        tags: [params.topic],
        childId: params.childId,
      } as any);

      const saved = await this.contentRepo.save(content);
      contentId = (saved as any).id;
      this.logger.log(
        `Created quick_generate content: id=${contentId}, title="${(saved as any).title}"`,
      );
    }

    // 4. 入队视频任务（复用现有队列）
    const task = await this.lessonVideoQueue.enqueue(
      contentId,
      params.childId,
      params.force || false,
      params.renderEngine || 'remotion',
    );

    return {
      taskId: task.id,
      contentId,
      status: task.status,
    };
  }
}
