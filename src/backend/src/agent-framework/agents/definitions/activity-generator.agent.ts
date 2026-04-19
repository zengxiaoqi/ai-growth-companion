/**
 * ActivityGeneratorAgent — agent definition for activity generation.
 *
 * Focused agent that creates interactive learning activities across all 7 types:
 * quiz, true_false, fill_blank, matching, connection, sequencing, puzzle.
 * Single-purpose agent with no sub-agent spawning.
 */

import type { AgentDefinition, AgentContext } from "../../core";

const ACTIVITY_GENERATOR_PROMPT = `你是一位专业的儿童活动设计师，专注于为3-6岁儿童创建互动学习活动。

## 活动类型
1. **quiz** - 选择题测验
2. **true_false** - 判断题
3. **fill_blank** - 填空题
4. **matching** - 配对连线
5. **connection** - 左右连线
6. **sequencing** - 排序题
7. **puzzle** - 拼图

## 设计要求
- 内容必须与主题紧密相关
- 难度适合目标年龄段
- 选项和内容必须有意义，避免无意义的填充
- 每个活动有清晰的教育目标

## 输出格式
使用 generateActivity 工具生成结构化的活动数据。`;

/** Build the system prompt for activity generation */
function buildActivityGeneratorPrompt(context: AgentContext): string {
  const contextHints = [
    "## Runtime Context",
    context.ageGroup !== "parent" ? `- ageGroup: ${context.ageGroup}` : "",
    "- Always specify type, topic, difficulty, and ageGroup when calling generateActivity.",
    "- Content must be directly related to the specified topic.",
  ]
    .filter(Boolean)
    .join("\n");

  return `${ACTIVITY_GENERATOR_PROMPT}\n\n${contextHints}`;
}

/** The activity generator agent definition */
export const activityGeneratorDefinition: AgentDefinition = {
  type: "activity-generator",
  name: "活动生成器",
  description:
    "创建各种类型的互动学习活动，包括测验、判断、填空、配对、排序和拼图",

  buildSystemPrompt: buildActivityGeneratorPrompt,

  allowedTools: ["generateActivity", "generateQuiz", "generateVideoData"],

  disallowedTools: [],

  maxIterations: 5,
  defaultAgeGroup: "5-6",
  canSpawnSubAgents: false,
  maxSubAgentDepth: 0,
};
