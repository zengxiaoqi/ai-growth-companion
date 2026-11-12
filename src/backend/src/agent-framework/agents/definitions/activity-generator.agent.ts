/**
 * ActivityGeneratorAgent — agent definition for activity generation.
 *
 * Focused agent that creates interactive learning activities across all 7 types:
 * quiz, true_false, fill_blank, matching, connection, sequencing, puzzle.
 * Single-purpose agent with no sub-agent spawning.
 */

import type { AgentDefinition, AgentContext } from '../../core';

const ACTIVITY_GENERATOR_PROMPT = `你是一位专业的儿童活动设计师，专注于为3-6岁儿童创建互动学习活动。

## 设计要求
- 内容必须与主题紧密相关
- 难度适合目标年龄段
- 选项和内容必须有意义，避免无意义的填充
- 每个活动有清晰的教育目标

## 工具使用规则（最高优先级）
- **你 MUST 调用 generateActivity 工具来生成活动数据。绝对不能不调用工具直接用文字描述活动！不调用工具=没有活动=功能完全失效。**
- **每次收到生成活动的请求，必须调用 generateActivity 工具。无论请求是"出题"、"做游戏"、"练习"还是"活动"，都必须调用工具。**
- 当用户要求N个活动/游戏/题目时，你必须调用 generateActivity 工具N次，每次生成一个不同类型的活动。例如"出3道数学小游戏"=调用3次generateActivity，使用3种不同的type（如quiz、true_false、matching）。
- **重要**：调用generateActivity后，回复文字中绝对不能透露题目答案、正确选项、或解题提示，只能说"我为你准备了活动，点击按钮开始挑战吧！"之类的引导语
- **重要**：不要说"点击上方蓝色按钮"或任何指向特定位置/颜色的话。活动按钮会自动出现在你的回复下方，只需说"点击下方按钮开始"即可`;

/** Build the system prompt for activity generation */
function buildActivityGeneratorPrompt(context: AgentContext): string {
  const effectiveAgeGroup = context.ageGroup === 'parent' ? '5-6' : context.ageGroup;
  const contextHints = [
    '## Runtime Context',
    `- ageGroup: ${effectiveAgeGroup} (use this value when calling generateActivity)`,
    context.childId != null ? `- childId: ${context.childId}` : '',
    context.parentId != null ? `- parentId: ${context.parentId}` : '',
    '- Content must be directly related to the specified topic.',
  ]
    .filter(Boolean)
    .join('\n');

  return `${ACTIVITY_GENERATOR_PROMPT}\n\n${contextHints}`;
}

/** The activity generator agent definition */
export const activityGeneratorDefinition: AgentDefinition = {
  type: 'activity-generator',
  name: '活动生成器',
  description: '创建各种类型的互动学习活动，包括测验、判断、填空、配对、排序和拼图',

  buildSystemPrompt: buildActivityGeneratorPrompt,

  allowedTools: ['generateActivity', 'generateQuiz', 'generateVideoData'],

  disallowedTools: [],

  maxIterations: 5,
  defaultAgeGroup: '5-6',
  canSpawnSubAgents: false,
  maxSubAgentDepth: 0,
};
