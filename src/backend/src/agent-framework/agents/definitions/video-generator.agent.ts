/**
 * VideoGeneratorAgent — agent definition for autonomous video generation.
 *
 * Full-pipeline agent that autonomously handles:
 * 1. Topic analysis and storyboard generation via LLM
 * 2. HTML/React composition authoring using skill guidance
 * 3. Rendering via HyperFrames or Remotion CLI
 * 4. Quality review and retry loop
 */

import type { AgentDefinition, AgentContext } from "../../core";

const VIDEO_GENERATOR_PROMPT = `你是一位专业的教学视频生成专家，能够自主完成从内容设计到视频渲染的全流程。

## 你的职责
- 根据主题、年龄段和领域，设计教学视频的分镜脚本
- 编写 HTML+GSAP 组合（HyperFrames）或 React 组件（Remotion）来构建视频画面
- 执行渲染命令生成视频文件
- 检查视频质量，不合格时修改并重试

## 工作流程
1. 调用 generateVideoContent 生成视频分镜脚本（场景、旁白、视觉描述）
2. 根据技能指导（hyperframes / remotion-video-creation）选择渲染引擎
3. 使用 writeFile 写入组合文件（HTML 或 React）
4. 使用 renderHyperframes 或 renderRemotion 执行渲染
5. 使用 reviewVideoQuality 检查生成内容与主题的匹配度
6. 如果质量不达标，分析问题并修改内容后重新渲染

## 内容质量标准
- 每个场景的旁白必须包含与主题相关的具体知识
- 禁止使用通用模板语言（"请和老师一起学习"、"我们来看看"等）
- 旁白长度 40-80 个中文字符，2-3 个完整句子
- 场景数量 4-8 个，覆盖主题的关键概念
- 视觉描述必须具体（明确角色、物品、背景、情绪）

## 渲染引擎选择
- HyperFrames: 适合快速生成、简单幻灯片、3-4 岁内容
- Remotion: 适合复杂动画、p5.js 交互、5-6 岁内容
- 根据主题复杂度和年龄段选择合适的引擎

## 安全限制
- 只能执行白名单内的命令（npx hyperframes, npx remotion, node, npm, ls, mkdir 等）
- 文件操作限制在工作目录内
- 不得删除系统文件或执行危险操作`;

/** Build the system prompt for video generation */
function buildVideoGeneratorPrompt(context: AgentContext): string {
  const contextHints = [
    "## Runtime Context",
    context.childId != null ? `- childId: ${context.childId}` : "",
    context.ageGroup !== "parent" ? `- ageGroup: ${context.ageGroup}` : "",
    "- Always specify topic and ageGroup when calling generateVideoContent.",
    "- Use skills (hyperframes, remotion-video-creation) for composition authoring guidance.",
    "- After rendering, always call reviewVideoQuality to validate output.",
    "- If quality score < 70, identify issues and regenerate affected content.",
    "- Return the final video file path when done.",
  ]
    .filter(Boolean)
    .join("\n");

  return `${VIDEO_GENERATOR_PROMPT}\n\n${contextHints}`;
}

/** The video generator agent definition */
export const videoGeneratorDefinition: AgentDefinition = {
  type: "video-generator",
  name: "视频生成专家",
  description:
    "专业视频生成专家，自主完成分镜设计、内容生成、组合编写、渲染执行和质量检查的全流程",

  buildSystemPrompt: buildVideoGeneratorPrompt,

  allowedTools: [
    "generateVideoContent",
    "executeCommand",
    "readFile",
    "writeFile",
    "renderHyperframes",
    "renderRemotion",
    "reviewVideoQuality",
  ],

  disallowedTools: [],

  allowedSkills: [
    "video-generation-orchestrator",
    "hyperframes",
    "hyperframes-cli",
    "hyperframes-video-creation",
    "remotion-video-creation",
    "remotion-video-creation-agent",
    "gsap",
    "css-animations",
    "three",
  ],

  maxIterations: 15,
  defaultAgeGroup: "5-6",
  canSpawnSubAgents: false,
  maxSubAgentDepth: 0,
};
