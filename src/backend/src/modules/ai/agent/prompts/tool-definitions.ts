import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "getUserProfile",
      description:
        "Get a child user profile including name, age, and basic attributes.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAbilities",
      description: "Get ability scores across learning domains for a child.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getLearningHistory",
      description:
        "Get recent learning records such as content, score, duration, and completion status.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
          limit: {
            type: "number",
            description: "Number of records to return, default 10",
            default: 10,
          },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchContent",
      description:
        "Search curriculum content by keyword, age range, and optional domain.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keyword" },
          ageRange: {
            type: "string",
            enum: ["3-4", "5-6"],
            description: "Target age range",
          },
          domain: {
            type: "string",
            enum: ["language", "math", "science", "art", "social"],
            description: "Learning domain",
          },
        },
        required: ["query", "ageRange"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRecommendations",
      description: "Get personalized learning recommendations for a child.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateQuiz",
      description:
        "Generate a quiz. Deprecated in practice; prefer generateActivity.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Quiz topic" },
          difficulty: {
            type: "number",
            description: "Difficulty 1-3",
            minimum: 1,
            maximum: 3,
          },
          ageGroup: { type: "string", enum: ["3-4", "5-6"] },
        },
        required: ["topic", "difficulty", "ageGroup"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateActivity",
      description: "Generate an interactive activity/game for children.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "quiz",
              "true_false",
              "fill_blank",
              "matching",
              "connection",
              "sequencing",
              "puzzle",
            ],
            description: "Activity type",
          },
          topic: { type: "string", description: "Learning topic" },
          difficulty: {
            type: "number",
            description: "Difficulty 1-3",
            minimum: 1,
            maximum: 3,
          },
          ageGroup: {
            type: "string",
            enum: ["3-4", "5-6"],
            description: "Target age group",
          },
          domain: {
            type: "string",
            enum: ["language", "math", "science", "art", "social"],
            description: "Learning domain (optional)",
          },
        },
        required: ["type", "topic", "difficulty", "ageGroup"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recordLearning",
      description:
        "Record one learning result to update learning history and abilities.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
          contentId: { type: "number", description: "Content ID" },
          score: {
            type: "number",
            description: "Score 0-100",
            minimum: 0,
            maximum: 100,
          },
          domain: {
            type: "string",
            enum: ["language", "math", "science", "art", "social"],
            description: "Learning domain",
          },
        },
        required: ["childId", "contentId", "score", "domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assignActivity",
      description:
        "Parent assignment flow: draft first, then confirm publish, and support canceling draft.",
      parameters: {
        type: "object",
        properties: {
          parentId: { type: "number", description: "Parent user ID" },
          childId: { type: "number", description: "Child user ID" },
          activityType: {
            type: "string",
            enum: [
              "quiz",
              "true_false",
              "fill_blank",
              "matching",
              "connection",
              "sequencing",
              "puzzle",
            ],
            description: "Activity type",
          },
          topic: { type: "string", description: "Learning topic" },
          difficulty: {
            type: "number",
            description: "Difficulty 1-3",
            minimum: 1,
            maximum: 3,
          },
          ageGroup: {
            type: "string",
            enum: ["3-4", "5-6"],
            description: "Target age group",
          },
          domain: {
            type: "string",
            enum: ["language", "math", "science", "art", "social"],
            description: "Learning domain (optional)",
          },
          dueDate: {
            type: "string",
            description: "Optional due date (YYYY-MM-DD)",
          },
          confirmPublish: {
            type: "boolean",
            description:
              "false/omit=create draft, true=publish confirmed draft",
          },
          cancelDraft: {
            type: "boolean",
            description: "Whether to cancel current pending draft",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getParentControl",
      description:
        "Get parent control settings such as daily limits and blocked topics.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listChildren",
      description: "List all children linked to a parent account.",
      parameters: {
        type: "object",
        properties: {
          parentId: { type: "number", description: "Parent user ID" },
        },
        required: ["parentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "viewReport",
      description:
        "View child learning report including minutes, completed tasks, and score trends.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
          period: {
            type: "string",
            enum: ["daily", "weekly", "monthly"],
            description: "Report period, default weekly",
          },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "viewAbilities",
      description: "View child ability levels and recent trend across domains.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateParentControl",
      description:
        "Update parent control settings such as limits and allowed domains.",
      parameters: {
        type: "object",
        properties: {
          parentId: { type: "number", description: "Parent user ID" },
          childId: { type: "number", description: "Child user ID (optional)" },
          dailyLimitMinutes: {
            type: "number",
            description: "Daily learning limit in minutes",
          },
          allowedDomains: {
            type: "array",
            items: { type: "string" },
            description: "Allowed learning domains",
          },
          blockedTopics: {
            type: "array",
            items: { type: "string" },
            description: "Blocked topics",
          },
          eyeProtectionEnabled: {
            type: "boolean",
            description: "Whether eye protection mode is enabled",
          },
          restReminderMinutes: {
            type: "number",
            description: "Rest reminder interval in minutes",
          },
        },
        required: ["parentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listAssignments",
      description: "List assignments for a child.",
      parameters: {
        type: "object",
        properties: {
          childId: { type: "number", description: "Child user ID" },
        },
        required: ["childId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateCoursePack",
      description:
        "Generate a complete home-learning course pack from one parent sentence, including listening/speaking/reading/writing modules, game data, visual-story prompts, and video storyboard.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Course topic from parent request",
          },
          ageGroup: {
            type: "string",
            enum: ["3-4", "5-6"],
            description: "Target age group",
          },
          durationMinutes: {
            type: "number",
            description: "Total course duration in minutes (10-45)",
          },
          focus: {
            type: "string",
            enum: ["literacy", "math", "science", "mixed"],
            description: "Primary focus area",
          },
          difficulty: {
            type: "number",
            minimum: 1,
            maximum: 3,
            description: "Difficulty level",
          },
          includeGame: {
            type: "boolean",
            description: "Whether to include interactive game payload",
          },
          includeAudio: {
            type: "boolean",
            description: "Whether to include listening/audio script module",
          },
          includeVideo: {
            type: "boolean",
            description: "Whether to include video storyboard module",
          },
          parentPrompt: {
            type: "string",
            description: "Original parent request sentence",
          },
        },
        required: ["topic"],
      },
    },
  },
];
