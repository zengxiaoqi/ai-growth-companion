import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions';

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getUserProfile',
      description: '获取用户的基本信息，包括姓名、年龄、性别。当需要了解用户是谁时调用。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子的用户ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAbilities',
      description: '获取用户在各领域（语言、数学、科学、艺术、社会）的能力评估分数和等级。当需要了解孩子的学习水平或规划学习路径时调用。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子的用户ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLearningHistory',
      description: '获取用户最近的学习记录，包括学习的内容、得分、时长、完成状态。当需要了解孩子的学习情况时调用。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子的用户ID' },
          limit: { type: 'number', description: '返回记录数量，默认10条', default: 10 },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchContent',
      description: '搜索课程内容。可以根据年龄段、学习领域、关键词来搜索适合的学习内容。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，如主题或标题' },
          ageRange: { type: 'string', enum: ['3-4', '5-6'], description: '目标年龄段' },
          domain: { type: 'string', enum: ['language', 'math', 'science', 'art', 'social'], description: '学习领域' },
        },
        required: ['query', 'ageRange'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRecommendations',
      description: '获取个性化学习内容推荐。根据用户的能力水平和学习历史推荐最适合的下一步学习内容。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子的用户ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateQuiz',
      description: '自动生成适合年龄的小测验题目。根据主题和难度生成选择题，用于检验学习效果。',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '测验主题，如"颜色"、"数字"、"动物"' },
          difficulty: { type: 'number', description: '难度等级 1-3', minimum: 1, maximum: 3 },
          ageGroup: { type: 'string', enum: ['3-4', '5-6'], description: '目标年龄组' },
        },
        required: ['topic', 'difficulty', 'ageGroup'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordLearning',
      description: '记录一次学习结果。当孩子完成了一个测验或学习活动后调用，用于更新学习记录。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子的用户ID' },
          contentId: { type: 'number', description: '学习内容的ID' },
          score: { type: 'number', description: '得分 0-100', minimum: 0, maximum: 100 },
        },
        required: ['childId', 'contentId', 'score'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getParentControl',
      description: '获取家长设置的限制条件，包括每日时间限制、允许的学习领域、屏蔽的主题。当需要检查是否可以推荐某个内容或继续学习时调用。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子的用户ID' },
        },
        required: ['childId'],
      },
    },
  },
];
