import { GenerateCoursePackTool } from "../../src/modules/ai/agent/tools/generate-course-pack";

describe("GenerateCoursePackTool scene output", () => {
  let tool: GenerateCoursePackTool;
  let llmClient: { generate: jest.Mock };
  let generateActivityTool: { execute: jest.Mock };

  beforeEach(() => {
    llmClient = {
      generate: jest.fn(),
    };
    generateActivityTool = {
      execute: jest.fn(),
    };
    tool = new GenerateCoursePackTool(
      llmClient as any,
      generateActivityTool as any,
    );
  });

  it("adds native watch/write/practice scene documents even when llm omits them", async () => {
    generateActivityTool.execute.mockResolvedValueOnce(
      JSON.stringify({
        type: "quiz",
        title: "Season Quiz",
        questions: [
          {
            question: "Which season has snow?",
            options: ["spring", "summer", "winter"],
            correctIndex: 2,
          },
        ],
      }),
    );

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        title: "Seasons Lesson",
        summary: "Learn the seasons",
        modules: {
          listening: {
            goal: "listen",
            audioScript: [
              {
                segment: "intro",
                narration: "Let us watch seasons",
                durationSec: 8,
              },
            ],
            questions: ["What did you hear?"],
          },
          speaking: {
            goal: "speak",
            warmup: "Say the season names",
            prompts: [{ prompt: "Name a season", sampleAnswer: "spring" }],
          },
          reading: {
            goal: "read",
            text: "Spring, summer, autumn, winter.",
            keywords: ["spring", "winter"],
            questions: ["Which season is cold?"],
          },
          writing: {
            goal: "trace season words",
            tracingItems: ["春"],
            practiceTasks: ["Trace the character"],
            checklist: ["follow the path"],
          },
        },
        visualStory: {
          style: "cartoon",
          scenes: [
            {
              scene: "Season changes",
              imagePrompt: "four seasons around a tree",
              narration: "Watch the tree change through the seasons",
              onScreenText: "Four seasons",
              durationSec: 10,
            },
          ],
        },
        videoLesson: {
          title: "Season video",
          durationSec: 60,
          shots: [
            {
              shot: "opening",
              visualPrompt: "spring flowers",
              narration: "Spring comes first",
              caption: "Spring",
              durationSec: 12,
            },
          ],
        },
        parentGuide: {
          beforeClass: ["prepare"],
          duringClass: ["encourage"],
          afterClass: ["review"],
          assessmentChecklist: ["watch", "trace"],
        },
      }),
    );

    const result = JSON.parse(
      await tool.execute({
        topic: "四季变化",
        ageGroup: "5-6",
        focus: "science",
        durationMinutes: 20,
        parentPrompt: "generate a season lesson",
      }),
    );

    expect(result.watch?.scene?.stepType).toBe("watch");
    expect(result.watch?.scene?.mode).toBe("playback");
    expect(result.watch?.scene?.scenes?.length).toBeGreaterThan(0);

    expect(result.write?.scene?.stepType).toBe("write");
    expect(result.write?.scene?.mode).toBe("guided_trace");
    expect(result.write?.scene?.scenes?.[0]?.interaction?.type).toBe(
      "trace_path",
    );

    expect(result.practice?.scene?.stepType).toBe("practice");
    expect(result.practice?.scene?.mode).toBe("activity_shell");
    expect(result.practice?.scene?.scenes?.[1]?.interaction?.type).toBe(
      "launch_activity",
    );
    expect(
      result.practice?.scene?.scenes?.[1]?.fallbackActivity?.activityType,
    ).toBe(result.game?.activityType);
    expect(
      result.practice?.scene?.scenes?.[1]?.fallbackActivity?.activityData,
    ).toEqual(result.game?.activityData);
  });

  it("backfills watch scene animation templates when native watch scenes omit them", async () => {
    generateActivityTool.execute.mockResolvedValueOnce(
      JSON.stringify({
        type: "quiz",
        title: "Word Quiz",
        questions: [
          { question: "念一念这个字", options: ["河", "海"], correctIndex: 0 },
        ],
      }),
    );

    llmClient.generate.mockResolvedValueOnce(
      JSON.stringify({
        title: "Word Lesson",
        summary: "Learn a character",
        modules: {
          listening: {
            goal: "listen",
            audioScript: [
              { segment: "intro", narration: "河字", durationSec: 8 },
            ],
            questions: [],
          },
          speaking: {
            goal: "speak",
            warmup: "说一说",
            prompts: [{ prompt: "这个字是什么", sampleAnswer: "河" }],
          },
          reading: {
            goal: "read",
            text: "河",
            keywords: ["河"],
            questions: [],
          },
          writing: {
            goal: "trace",
            tracingItems: ["河"],
            practiceTasks: ["描一描"],
            checklist: ["跟着描"],
          },
        },
        watch: {
          scene: {
            version: 1,
            stepType: "watch",
            mode: "playback",
            scenes: [
              {
                id: "watch-scene-1",
                title: "河字讲解",
                narration: "先看一看河字。",
                onScreenText: "认识“河”字",
                durationSec: 10,
                visual: {
                  background: { type: "indoor" },
                },
              },
            ],
          },
        },
        visualStory: {
          style: "cartoon",
          scenes: [
            {
              scene: "河字讲解",
              imagePrompt: "课堂里展示河字",
              narration: "先看一看河字。",
              onScreenText: "认识“河”字",
              durationSec: 10,
            },
          ],
        },
        videoLesson: {
          title: "Word video",
          durationSec: 60,
          shots: [
            {
              shot: "河字讲解",
              visualPrompt: "课堂里展示河字",
              narration: "先看一看河字。",
              caption: "认识“河”字",
              durationSec: 12,
            },
          ],
        },
        parentGuide: {
          beforeClass: ["prepare"],
          duringClass: ["encourage"],
          afterClass: ["review"],
          assessmentChecklist: ["watch"],
        },
      }),
    );

    const result = JSON.parse(
      await tool.execute({
        topic: "山河湖海",
        ageGroup: "5-6",
        focus: "literacy",
        domain: "language",
        durationMinutes: 20,
        parentPrompt: "teach the character 河",
      }),
    );

    const riverScene = result.watch?.scene?.scenes?.find((scene: any) => {
      const source = String(scene?.onScreenText || scene?.title || "");
      return (
        source.includes("河字") ||
        source.includes("“河”") ||
        source.includes('"河"')
      );
    });

    expect(["language.character-stroke", "language.word-reveal"]).toContain(
      riverScene?.visual?.templateId,
    );
    if (riverScene?.visual?.templateId === "language.character-stroke") {
      expect(riverScene?.visual?.templateParams).toMatchObject({
        character: "河",
      });
    } else {
      expect(riverScene?.visual?.templateParams?.words).toContain("河");
    }
  });
});
