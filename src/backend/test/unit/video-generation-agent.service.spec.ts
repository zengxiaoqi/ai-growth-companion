import { VideoGenerationAgentService } from "../../src/modules/learning/video-generation-agent.service";

describe("VideoGenerationAgentService", () => {
  it("extracts the latest raw generateVideoContent tool result from the agent loop", async () => {
    const firstStoryboard = {
      title: "认识动物老虎初稿",
      topic: "认识动物老虎",
      domain: "science",
      totalDurationSec: 30,
      sceneCount: 1,
      scenes: [
        {
          id: "scene-1",
          sequence: 1,
          title: "森林之王",
          concept: "老虎",
          narration: "老虎身上有黑色条纹。",
          onScreenText: "老虎条纹",
          visualDescription: "森林里的老虎",
          durationSec: 6,
          transitionToNext: "fade",
          emphasis: "intro",
        },
      ],
      visualTheme: {
        primaryPalette: "#FFF5E6",
        accentColor: "#FF6B35",
        mood: "playful",
      },
      narrativeArc: "intro",
    };
    const finalStoryboard = {
      ...firstStoryboard,
      title: "认识动物老虎终稿",
      scenes: [
        {
          ...firstStoryboard.scenes[0],
          title: "老虎的本领",
          narration: "老虎会奔跑和游泳，是大型猫科动物。",
          onScreenText: "老虎本领",
        },
      ],
    };
    const quality = {
      passed: true,
      score: 82,
      issues: ["template mismatch"],
    };

    const executorService = {
      runLoop: jest.fn(
        async (
          _systemPrompt,
          _messages,
          _toolDefinitions,
          _maxIterations,
          _context,
          onToolCall,
        ) => {
          await onToolCall({
            toolName: "generateVideoContent",
            args: { topic: "认识动物老虎" },
            result: JSON.stringify(firstStoryboard),
          });
          await onToolCall({
            toolName: "generateVideoContent",
            args: { topic: "认识动物老虎" },
            result: JSON.stringify(finalStoryboard),
          });
          await onToolCall({
            toolName: "reviewVideoQuality",
            args: { topic: "认识动物老虎" },
            result: JSON.stringify(quality),
          });
          return { response: "done", toolCalls: [] };
        },
      ),
    };
    const toolRegistry = {
      getToolDefinitions: jest
        .fn()
        .mockReturnValue([
          { type: "function", function: { name: "generateVideoContent" } },
          { type: "function", function: { name: "reviewVideoQuality" } },
        ]),
    };
    const service = new VideoGenerationAgentService(
      toolRegistry as any,
      {} as any,
      executorService as any,
      { getSkillsForAgent: jest.fn().mockReturnValue([]) } as any,
      { renderSkillForPrompt: jest.fn() } as any,
    );

    const result = await service.generateViaAgent({
      topic: "认识动物老虎",
      domain: "science",
      ageGroup: "5-6",
      contentId: 62,
      childId: 2,
      payload: {},
    });

    expect(result.storyboard).toMatchObject({
      title: "认识动物老虎终稿",
      scenes: [
        expect.objectContaining({
          title: "老虎的本领",
          narration: expect.stringContaining("老虎"),
        }),
      ],
    });
    expect(result.qualityScore).toBe(82);
    expect(result.qualityPassed).toBe(true);
    expect(result.issues).toEqual(["template mismatch"]);
    expect(toolRegistry.getToolDefinitions).toHaveBeenCalled();
  });
});
