import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
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

动作（写在 visualStory.scenes 的 performance 里，可选但很重要）：
- 只要这一幕里角色真的在动（而不是站着被讲解），就必须写 performance。
  它是一个**按时间排序的动作列表**，孩子看到的顺序就是数组顺序。
- 只动一次就写 1 个动作；如果是"走过去 → 指着滑梯 → 说一句话"这样连续的两三下，
  就把它们按顺序写进同一个 actions 数组，**不要拆成三幕**——拆开就是三次镜头切换，
  孩子刚跟上动作画面就跳走了。一幕最多 3 个动作。
- 能演的动作只有下面这些，不要发明新动词：
  · 单人：walk 走过去/跑过去、climb 爬上去、point 指着某物、speak 对着镜头说话、
    cheer 欢呼、sit 坐下、hold 举着某物、slide 从滑梯滑下来、dribble 拍皮球
  · 双人：handover 把东西递给别人（role 写 giver + receiver）、
    lift-together 两人一起抬（role 写 helper + helper）
- climb / slide / dribble 只能放在最后一个（它们结束时角色已在高处或滑行终点，
  后面再接别的动作会瞬移）。
- actors 只在 performance 层写一次，后续动作省略并自动继承；不要每个动作都重抄一遍。
- actors 的 id 用英文小写名词（bear / rabbit / tiger），label 用旁白里的中文叫法（小熊 / 小兔）。
- 道具分两件事：**先声明，再引用**。
  · 声明写在 visualStory.scenes 的 props 数组里，名字用中文自由字符串，最多 3 个：
    {"name":"洒水壶","place":"hand","heightRatio":0.22}
    -place 只能是 hand（拿在手里）/ floor（放在地上）/ worn（穿在身上）；
    -heightRatio 是这个东西相对角色的高度（0.08~0.9），参考：苹果 0.1、杯子 0.12、
     皮球 0.22、水桶 0.22、椅子 0.35、桌子 0.55；
    -只声明旁白里真的用到的实物（"提着洒水壶" → 洒水壶），不要列角色、天气、抽象概念。
  · 动作要指向某个道具时，propId 写 props 里那个名字（propId 用 "洒水壶"），
    或者内置道具 id：ball / cookie / apple / banana / book / block / table / slide / star / heart。
    指向声明过的名字时，画面会画出那个道具并挂到手上/摆在地上；指向内置 id 用现成图形。
- 只写意图，不要写坐标、高度、帧数、时长——画面几何与动作时长由渲染层决定，写了也会被忽略。
- 这一幕没有明显动作（纯讲知识）就省略 performance，不要硬凑。

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
        "props": [{ "name": "洒水壶", "place": "hand", "heightRatio": 0.22 }],
        "animationTemplate": { "id": "dynamic.story-scene" },
        "performance": {
          "actors": [{ "id": "bear", "label": "小熊", "role": "helper" }],
          "actions": [
            { "verb": "walk" },
            { "verb": "point", "propId": "slide" },
            { "verb": "speak", "speech": "看，这就是滑梯" }
          ]
        }
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
        uuid: randomUUID(),
        title: lessonData.title || params.topic,
        topic: params.topic,
        ageRange: params.ageGroup,
        domain: lessonData.domain || 'language',
        subtitle: lessonData.summary || '',
        source: 'quick_generate',
        // 将 AI 生成的完整数据存入 content 字段（JSON 类型）
        content: lessonData,
        status: 'published',
        contentType: 'video_lesson',
        difficulty: 1,
        durationMinutes: Math.ceil((params.durationSec || 60) / 60),
        mediaUrls: [],
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
    // 快速视频生成是家长主动发起 → autoApprove 直接放行给孩子看，无需二次审批。
    const task = await this.lessonVideoQueue.enqueue(
      contentId,
      params.childId,
      params.force || false,
      params.renderEngine || 'auto',
      true,
    );

    return {
      taskId: task.id,
      contentId,
      status: task.status,
    };
  }
}
