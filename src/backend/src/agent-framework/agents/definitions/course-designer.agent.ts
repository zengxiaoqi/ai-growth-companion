/**
 * CourseDesignerAgent — agent definition for course pack generation.
 *
 * Focused agent that generates structured course packs containing
 * multiple learning activities across domains (listen, speak, read, write).
 * This is a specialized, single-purpose agent with no sub-agent spawning.
 */

import type { AgentDefinition, AgentContext } from '../../core';

const COURSE_DESIGNER_PROMPT = `你是一位专业的课程设计师，专注于为3-6岁儿童设计家庭学习课程包。

## 你的职责
- 根据家长的需求描述，设计完整的学习课程包
- 确保课程包含听说读写四个模块
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
  ].filter(Boolean).join('\n');

  return `${COURSE_DESIGNER_PROMPT}\n\n${contextHints}`;
}

/** The course designer agent definition */
export const courseDesignerDefinition: AgentDefinition = {
  type: 'course-designer',
  name: '课程设计师',
  description: '专业课程设计师，生成包含听、说、读、写、游戏的结构化课程包',

  buildSystemPrompt: buildCourseDesignerPrompt,

  allowedTools: [
    'generateCoursePack',
    'generateActivity',
    'searchContent',
  ],

  disallowedTools: [],

  allowedSkills: ['course-pack-flow', 'activity-validation'],

  maxIterations: 5,
  defaultAgeGroup: '5-6',
  canSpawnSubAgents: false,
  maxSubAgentDepth: 0,
};
