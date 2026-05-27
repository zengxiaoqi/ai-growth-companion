import { CourseGenerationAgentService } from '../../src/modules/learning/course-generation-agent.service';

describe('CourseGenerationAgentService', () => {
  it('returns the course pack produced by the generateCoursePack tool call', async () => {
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
            toolName: 'generateCoursePack',
            args: { topic: '认识动物老虎' },
            result: JSON.stringify({
              type: 'course_pack',
              topic: '认识动物老虎',
              modules: { listening: {} },
            }),
          });
          return { response: 'done', toolCalls: [] };
        },
      ),
    };
    const toolRegistry = {
      has: jest.fn().mockReturnValue(true),
      getToolDefinitions: jest
        .fn()
        .mockReturnValue([{ type: 'function', function: { name: 'generateCoursePack' } }]),
    };
    const service = new CourseGenerationAgentService(
      executorService as any,
      toolRegistry as any,
      { getSkillsForAgent: jest.fn().mockReturnValue([]) } as any,
      { renderSkillForPrompt: jest.fn() } as any,
    );

    const result = await service.generateCoursePack({
      topic: '认识动物老虎',
      ageGroup: '5-6',
      domain: 'science',
      focus: 'science',
      includeGame: false,
      includeAudio: false,
      includeVideo: true,
    });

    expect(result).toMatchObject({
      type: 'course_pack',
      topic: '认识动物老虎',
    });
    expect(toolRegistry.getToolDefinitions).toHaveBeenCalled();
    expect(executorService.runLoop).toHaveBeenCalled();
  });
});
