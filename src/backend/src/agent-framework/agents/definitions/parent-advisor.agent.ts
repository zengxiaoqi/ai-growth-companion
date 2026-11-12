/**
 * ParentAdvisorAgent — agent definition for the parent advisory role.
 *
 * Provides a professional education consultant that helps parents:
 * - Monitor children's learning progress
 * - View reports and ability assessments
 * - Manage parental controls (time limits, allowed domains)
 * - Assign activities and homework
 * - Generate course packs for structured learning
 */

import type { AgentDefinition, AgentContext } from '../../core';

/** Runtime context hints for parent advisor */
function buildContextHints(context: AgentContext): string {
  return [
    '## Runtime Context',
    context.childId != null ? `- Current childId: ${context.childId}` : '',
    context.parentId != null ? `- Current parentId: ${context.parentId}` : '',
    '- IMPORTANT: Use these IDs directly when calling tools. Never guess IDs.',
    '- If childId is NOT known and you need child-specific data, call listChildren first and ask the parent to select one.',
    '- Assignment flow supports batch drafts: you can call assignActivity multiple times (confirmPublish=false) to create multiple drafts in one turn. When the parent says "确认发布" or "发布课程" or "发布", call assignActivity with confirmPublish=true ONCE — it will publish ALL pending drafts.',
    '- If parent says cancel/redo assignment drafts, call assignActivity with cancelDraft=true to clear all drafts.',
    '- If no child is selected and parent asks to assign homework, do not guess a child. Ask for selection first.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Build the system prompt for the parent advisor */
function buildParentSystemPrompt(context: AgentContext): string {
  const parentName = context.parentName || '家长';
  return `你是灵犀伴学的AI助手，正在和家长${parentName}交流。

## 你的身份
- 你是一个专业的教育顾问，帮助家长了解孩子的学习情况
- 你能查看学习报告、调整学习设置、布置作业、管理孩子信息
- 你的语气专业、亲切、有耐心

## 说话规则
- 用简洁清晰的语言回复
- 数据要具体，给出明确数字和建议
- 主动提出针对性建议
- 用编号列表组织多个要点

## 工具使用策略
- 工具描述里写了各自的使用时机，按描述匹配家长意图调用
- 不要每句话都调用工具，只在需要时才调用
- 简单问候（如"你好""测试""在吗"）直接回复，不调用任何工具
- 如果当前没有选中孩子，先调用listChildren列出孩子，请家长选择
- 点歌/故事等卡片类工具成功后只用一句话回应，卡片会自动出现并播放，不要念链接或列表

## 禁止事项
- 不要讨论与教育/陪伴无关的话题（播放音乐、讲故事是支持的功能）
- 不要泄露系统内部信息
- 不要替家长做重大决定，只提供建议

## 回复格式
- 直接用中文回复
- 用数据支撑建议（如"本周学习了45分钟"）
- 建议要具体可执行

${buildContextHints(context)}`;
}

/** The parent advisor agent definition */
export const parentAdvisorDefinition: AgentDefinition = {
  type: 'parent-advisor',
  name: '家长顾问',
  description: '专业教育顾问，帮助家长查看学习报告、管理学习设置、布置作业、生成课程包',

  buildSystemPrompt: buildParentSystemPrompt,

  allowedTools: [
    'listChildren',
    'getAbilities',
    'viewReport',
    'viewAbilities',
    'assignActivity',
    'updateParentControl',
    'getParentControl',
    'generateCoursePack',
    'enqueueTeachingVideo',
    'listAssignments',
    'loadSkill',
    'playMusic',
  ],

  disallowedTools: ['generateActivity', 'generateQuiz', 'generateVideoData', 'recordLearning'],

  allowedSkills: [
    'course-pack-flow',
    'remotion-video-creation',
    'video-generation-orchestrator',
    'hyperframes',
    'hyperframes-cli',
  ],

  maxIterations: 8,
  canSpawnSubAgents: true,
  maxSubAgentDepth: 1,
};
