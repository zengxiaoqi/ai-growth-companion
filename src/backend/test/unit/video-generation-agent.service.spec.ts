import { VideoGenerationAgentService } from "../../src/modules/learning/video-generation-agent.service";

describe("VideoGenerationAgentService", () => {
  const createService = () =>
    new VideoGenerationAgentService(
      { getToolDefinitions: jest.fn().mockReturnValue([]) } as any,
      {} as any,
      { runLoop: jest.fn() } as any,
      { getSkillsForAgent: jest.fn().mockReturnValue([]) } as any,
      { renderSkillForPrompt: jest.fn() } as any,
    );

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

  it("generates a dynamic Remotion manifest with topic-specific tiger visuals", async () => {
    const service = createService();
    const manifest = await service.generateRemotionComposition(
      {
        title: "认识动物老虎",
        topic: "认识动物老虎",
        domain: "science",
        totalDurationSec: 18,
        sceneCount: 3,
        scenes: [
          {
            id: "scene-1",
            sequence: 1,
            title: "老虎条纹",
            concept: "外形",
            narration: "老虎身上有橙色皮毛和黑色条纹，条纹能帮助它藏在森林里。",
            onScreenText: "黑色条纹",
            visualDescription: "森林里的老虎展示黑色条纹",
            durationSec: 6,
            transitionToNext: "fade",
            emphasis: "intro",
          },
          {
            id: "scene-2",
            sequence: 2,
            title: "老虎游泳",
            concept: "本领",
            narration: "老虎会游泳，能穿过小河去寻找食物。",
            onScreenText: "会游泳",
            visualDescription: "老虎在河里游泳，水花飞起来",
            durationSec: 6,
            transitionToNext: "fade",
            emphasis: "core-concept",
          },
        ],
        visualTheme: {
          primaryPalette: "#E8F8FF",
          accentColor: "#f08c00",
          mood: "playful",
        },
        narrativeArc: "intro",
      } as any,
      { domain: "science", ageGroup: "5-6" },
    );

    const generatedCode = manifest.files.map((file) => file.content).join("\n");
    expect(manifest.compositionId).toMatch(/^GeneratedLesson-/);
    expect(manifest.files.map((file) => file.path)).toEqual([
      "index.ts",
      "Root.tsx",
      "GeneratedLesson.tsx",
    ]);
    expect(generatedCode).toContain("TigerSvg");
    expect(generatedCode).toContain("stripe");
    expect(generatedCode).toContain("forest");
    expect(manifest.sceneAssetSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "老虎条纹",
          generatedVisual: expect.stringContaining("tiger"),
        }),
      ]),
    );
    expect(manifest.props.scenes[0]).toMatchObject({
      assetKey: "tiger",
      action: "showFeatures",
      habitat: "forest",
    });
    expect(manifest.props.scenes[1]).toMatchObject({
      assetKey: "tiger",
      action: "swim",
      habitat: "river",
    });
  });
});
