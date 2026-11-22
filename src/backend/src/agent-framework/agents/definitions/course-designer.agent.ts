/**
 * CourseDesignerAgent — agent definition for course pack generation.
 *
 * Focused agent that generates structured course packs with a four-step
 * skeleton (watch → understand → output → practice); the output step adapts
 * to the learning domain (write / draw / roleplay / experiment).
 * This is a specialized, single-purpose agent with no sub-agent spawning.
 */

import type { AgentDefinition, AgentContext } from '../../core';

const COURSE_DESIGNER_PROMPT = `你是一位专业的课程设计师，专注于为3-6岁儿童设计家庭学习课程包。

## 你的职责
- 根据家长的需求描述，设计完整的学习课程包
- 课程遵循四步骨架：看→理解→输出→练；输出步按学习领域选择：语言/数学→写，科学→做（模拟实验），艺术→画，社会→演（角色扮演）
- 生成互动游戏数据和动画模板
- 设计教学视频分镜脚本
- 提供家长指导手册

## 设计原则
- 内容适合目标年龄段
- 每个模块有明确的学习目标
- 活动多样化，避免单一形式
- 注重趣味性和互动性

## 输出格式
使用 generateCoursePack 工具生成结构化的课程包数据。`;

/** Build the system prompt for course pack generation */
function buildCourseDesignerPrompt(context: AgentContext): string {
  const contextHints = [
    '## Runtime Context',
    context.childId != null ? `- childId: ${context.childId}` : '',
    context.ageGroup !== 'parent' ? `- ageGroup: ${context.ageGroup}` : '',
    '- Always specify ageGroup and topic when calling generateCoursePack.',
    '- Generate age-appropriate content.',
  ]
    .filter(Boolean)
    .join('\n');

  return `${COURSE_DESIGNER_PROMPT}\n\n${contextHints}`;
}

/** The course designer agent definition */
export const courseDesignerDefinition: AgentDefinition = {
  type: 'course-designer',
  name: '课程设计师',
  description: '专业课程设计师，生成四步骨架（看→理解→输出→练）的结构化课程包，输出步按领域为写/画/演/做',

  buildSystemPrompt: buildCourseDesignerPrompt,

  allowedTools: [
    'generateCoursePack',
    'generateActivity',
    'searchContent',
    'webSearch',
    'enqueueTeachingVideo',
    'generateVideoContent',
    'executeCommand',
    'readFile',
    'writeFile',
    'renderHyperframes',
    'renderRemotion',
    'reviewVideoQuality',
    'loadSkill',
  ],

  disallowedTools: [],

  allowedSkills: [
    'course-pack-flow',
    'activity-validation',
    'remotion-video-creation',
    'video-generation-orchestrator',
    'hyperframes',
    'hyperframes-cli',
    'gsap',
    'css-animations',
  ],

  maxIterations: 8,
  defaultAgeGroup: '5-6',
  canSpawnSubAgents: false,
  maxSubAgentDepth: 0,
};
