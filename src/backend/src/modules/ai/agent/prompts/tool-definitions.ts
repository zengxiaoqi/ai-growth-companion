import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions';
import { ACTIVITY_TYPES } from '../../../../agent-framework/core/types/tool-metadata';

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getUserProfile',
      description: 'Get a child user profile including name, age, and basic attributes.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAbilities',
      description: 'Get ability scores across learning domains for a child.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLearningHistory',
      description:
        'Get recent learning records such as content, score, duration, and completion status.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
          limit: {
            type: 'number',
            description: 'Number of records to return, default 10',
            default: 10,
          },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchContent',
      description: 'Search curriculum content by keyword, age range, and optional domain.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword' },
          ageRange: {
            type: 'string',
            enum: ['3-4', '5-6'],
            description: 'Target age range',
          },
          domain: {
            type: 'string',
            enum: ['language', 'math', 'science', 'art', 'social'],
            description: 'Learning domain',
          },
        },
        required: ['query', 'ageRange'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRecommendations',
      description: 'Get personalized learning recommendations for a child.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateQuiz',
      description: 'Generate a quiz. Deprecated in practice; prefer generateActivity.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Quiz topic' },
          difficulty: {
            type: 'number',
            description: 'Difficulty 1-3',
            minimum: 1,
            maximum: 3,
          },
          ageGroup: { type: 'string', enum: ['3-4', '5-6'] },
        },
        required: ['topic', 'difficulty', 'ageGroup'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateActivity',
      description: 'Generate an interactive activity/game for children.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [...ACTIVITY_TYPES],
            description: 'Activity type',
          },
          topic: { type: 'string', description: 'Learning topic' },
          difficulty: {
            type: 'number',
            description: 'Difficulty 1-3',
            minimum: 1,
            maximum: 3,
          },
          ageGroup: {
            type: 'string',
            enum: ['3-4', '5-6'],
            description: 'Target age group',
          },
          domain: {
            type: 'string',
            enum: ['language', 'math', 'science', 'art', 'social'],
            description: 'Learning domain (optional)',
          },
        },
        required: ['type', 'topic', 'difficulty', 'ageGroup'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordLearning',
      description: 'Record one learning result to update learning history and abilities.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
          contentId: { type: 'number', description: 'Content ID' },
          score: {
            type: 'number',
            description: 'Score 0-100',
            minimum: 0,
            maximum: 100,
          },
          domain: {
            type: 'string',
            enum: ['language', 'math', 'science', 'art', 'social'],
            description: 'Learning domain',
          },
        },
        required: ['childId', 'contentId', 'score', 'domain'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assignActivity',
      description:
        'Parent assignment flow: call multiple times to batch-create drafts (confirmPublish=false), then call once with confirmPublish=true to publish ALL drafts at once. Also supports canceling all drafts (cancelDraft=true).',
      parameters: {
        type: 'object',
        properties: {
          parentId: { type: 'number', description: 'Parent user ID' },
          childId: { type: 'number', description: 'Child user ID' },
          activityType: {
            type: 'string',
            enum: [...ACTIVITY_TYPES],
            description: 'Activity type',
          },
          topic: { type: 'string', description: 'Learning topic' },
          difficulty: {
            type: 'number',
            description: 'Difficulty 1-3',
            minimum: 1,
            maximum: 3,
          },
          ageGroup: {
            type: 'string',
            enum: ['3-4', '5-6'],
            description: 'Target age group',
          },
          domain: {
            type: 'string',
            enum: ['language', 'math', 'science', 'art', 'social'],
            description: 'Learning domain (optional)',
          },
          dueDate: {
            type: 'string',
            description: 'Optional due date (YYYY-MM-DD)',
          },
          confirmPublish: {
            type: 'boolean',
            description: 'false/omit=create draft, true=publish ALL confirmed drafts at once',
          },
          cancelDraft: {
            type: 'boolean',
            description: 'Whether to cancel all pending drafts',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getParentControl',
      description: 'Get parent control settings such as daily limits and blocked topics.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listChildren',
      description: 'List all children linked to a parent account.',
      parameters: {
        type: 'object',
        properties: {
          parentId: { type: 'number', description: 'Parent user ID' },
        },
        required: ['parentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'viewReport',
      description:
        'View child learning report including minutes, completed tasks, and score trends.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
          period: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
            description: 'Report period, default weekly',
          },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'viewAbilities',
      description: 'View child ability levels and recent trend across domains.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateParentControl',
      description: 'Update parent control settings such as limits and allowed domains.',
      parameters: {
        type: 'object',
        properties: {
          parentId: { type: 'number', description: 'Parent user ID' },
          childId: { type: 'number', description: 'Child user ID (optional)' },
          dailyLimitMinutes: {
            type: 'number',
            description: 'Daily learning limit in minutes',
          },
          allowedDomains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Allowed learning domains',
          },
          blockedTopics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Blocked topics',
          },
          eyeProtectionEnabled: {
            type: 'boolean',
            description: 'Whether eye protection mode is enabled',
          },
          restReminderMinutes: {
            type: 'number',
            description: 'Rest reminder interval in minutes',
          },
        },
        required: ['parentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listAssignments',
      description: 'List assignments for a child.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: 'Child user ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enqueueTeachingVideo',
      description:
        'Create an async teaching-video generation task and return taskId immediately. Default engine is auto (prefer HyperFrames, fallback to Remotion).',
      parameters: {
        type: 'object',
        properties: {
          lessonId: {
            type: 'number',
            description: 'Lesson content ID to generate video for',
          },
          childId: { type: 'number', description: 'Child user ID' },
          engine: {
            type: 'string',
            enum: ['auto', 'hyperframes', 'remotion'],
            description: 'Render engine selection, default auto',
          },
          force: {
            type: 'boolean',
            description: 'Whether to force a new task and ignore reusable cached results',
          },
        },
        required: ['lessonId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateCoursePack',
      description:
        'Generate a complete home-learning course pack from one parent sentence, including listening/speaking/reading/writing modules, game data, visual-story prompts, and video storyboard.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Course topic from parent request',
          },
          ageGroup: {
            type: 'string',
            enum: ['3-4', '5-6'],
            description: 'Target age group',
          },
          durationMinutes: {
            type: 'number',
            description: 'Total course duration in minutes (10-45)',
          },
          focus: {
            type: 'string',
            enum: ['literacy', 'math', 'science', 'mixed'],
            description: 'Primary focus area',
          },
          difficulty: {
            type: 'number',
            minimum: 1,
            maximum: 3,
            description: 'Difficulty level',
          },
          includeGame: {
            type: 'boolean',
            description: 'Whether to include interactive game payload',
          },
          includeAudio: {
            type: 'boolean',
            description: 'Whether to include listening/audio script module',
          },
          includeVideo: {
            type: 'boolean',
            description: 'Whether to include video storyboard module',
          },
          parentPrompt: {
            type: 'string',
            description: 'Original parent request sentence',
          },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'queryBookSkill',
      description:
        '搜索已上传的知识书内容（章节、术语、模式）。当孩子问一个需要书本知识才能回答的问题时，调用此工具搜索相关知识点。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，如"光合作用""恐龙灭绝""分数运算"等' },
          bookId: { type: 'number', description: '可选，限定在某本书中搜索' },
          limit: { type: 'number', description: '返回结果数量上限' },
          ageGroup: { type: 'string', enum: ['3-4', '5-6'], description: '可选，按年龄组筛选' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateBookLesson',
      description:
        '基于知识书内容生成互动课程。当家长或孩子想用一本书来学习时调用，生成包含章节内容、术语、模式的课程。',
      parameters: {
        type: 'object',
        properties: {
          bookId: { type: 'number', description: '知识书 ID' },
          chapterIndex: { type: 'number', description: '可选，指定章节' },
          childId: { type: 'number', description: '孩子用户 ID' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: '难度' },
        },
        required: ['bookId', 'childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recallMemory',
      description:
        '回忆你和这个孩子过去聊过的事情（跨会话的长期记忆）。' +
        '当孩子提到「上次 / 以前 / 还记得吗 / 又 / 还是 / 说过 / 答应过」，' +
        '主动让你记住某件事，或你需要知道他的偏好才能回答得更好时，调用本工具。' +
        '普通闲聊、问知识题、讲故事时不要调用——本工具每次都会产生检索开销。' +
        '返回的是结构化结果与回忆素材，话术请按当前年龄的语气自己组织。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              '要回忆的内容，用孩子提到的关键词即可，例如"霸王龙""上次那个约定"。不要写成问句。',
          },
          limit: {
            type: 'number',
            description: '返回条数上限，默认 8，最多 20',
          },
          since: {
            type: 'string',
            description: '可选，只回忆该日期（YYYY-MM-DD）之后记下的事情',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saveMemory',
      description:
        '把值得长期记住的事情记下来，供以后回忆。' +
        '适合：孩子说出的偏好（喜欢/讨厌什么）、重要事件（生日、比赛、春游）、' +
        '带日期的计划、以及他特意让你记住的事。' +
        '不适合：一次性的问题、临时情绪、你自己说的话、常识知识。' +
        'verbatimQuote 必须是孩子原话里的连续片段，一个字都不能改，' +
        '否则会被逐字校验丢弃。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '用第三人称写一句简短描述，例如"孩子最喜欢霸王龙，尤其是三角龙"',
          },
          verbatimQuote: {
            type: 'string',
            description: '孩子原话的逐字片段，不要改写、不要补标点、不要把两句拼成一句',
          },
          kind: {
            type: 'string',
            enum: ['event', 'topic', 'detail', 'preference'],
            description: 'preference=偏好，event=事件，topic=话题，detail=细节',
          },
          occurredAt: {
            type: 'string',
            description: '事件发生日期 YYYY-MM-DD。只有能确定日期时才填，"周四"这类相对说法不要猜',
          },
          confidence: {
            type: 'number',
            description: '你对"值得记且没有编造"的把握，0-1，低于 0.75 会被丢弃',
          },
          sensitivity: {
            type: 'string',
            enum: ['L0', 'L1', 'L2'],
            description: '敏感级别。孩子明确要求保密的一律填 L2（系统也会强制）',
          },
          secrets: {
            type: 'array',
            items: { type: 'string' },
            description: '孩子要求保密的原话片段，可留空',
          },
        },
        required: ['content', 'verbatimQuote'],
      },
    },
  },
];
