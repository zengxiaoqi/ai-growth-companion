import { GenerateActivityTool } from '../../src/modules/ai/agent/tools/generate-activity';

describe('GenerateActivityTool', () => {
  let tool: GenerateActivityTool;
  let llmClient: { generate: jest.Mock };

  beforeEach(() => {
    llmClient = {
      generate: jest.fn(),
    };
    tool = new GenerateActivityTool(llmClient as any);
  });

  it('retries after first failure and succeeds with topic-aligned data', async () => {
    llmClient.generate
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(JSON.stringify({
        title: '\u519c\u573a\u52a8\u7269\u5c0f\u6d4b\u9a8c',
        questions: [
          {
            question: '\u519c\u573a\u91cc\u54ea\u79cd\u52a8\u7269\u4f1a\u4ea7\u5976\uff1f',
            options: ['\u5c0f\u732a', '\u5976\u725b', '\u6bcd\u9e21'],
            correctAnswer: '\u5976\u725b',
            correctIndex: 99,
            explanation: '\u5976\u725b\u662f\u519c\u573a\u91cc\u4f1a\u4ea7\u5976\u7684\u52a8\u7269\u3002',
          },
          {
            question: '\u519c\u573a\u91cc\u54ea\u79cd\u52a8\u7269\u4f1a\u4e0b\u86cb\uff1f',
            options: ['\u6bcd\u9e21', '\u5c0f\u7f8a', '\u5c0f\u9a6c'],
            correctIndex: 0,
            explanation: '\u6bcd\u9e21\u4f1a\u4e0b\u86cb\u3002',
          },
          {
            question: '\u5c0f\u732a\u7684\u53eb\u58f0\u66f4\u63a5\u8fd1\u54ea\u4e2a\uff1f',
            options: ['\u54de\u54de', '\u6c6a\u6c6a', '\u5495\u5495'],
            correctIndex: 0,
            explanation: '\u5c0f\u732a\u5e38\u89c1\u7684\u53eb\u58f0\u662f\u54de\u54de\u3002',
          },
        ],
      }));

    const resultStr = await tool.execute({
      type: 'quiz',
      topic: '\u519c\u573a\u52a8\u7269\u7ec3\u4e60',
      difficulty: 2,
      ageGroup: '5-6',
    });
    const result = JSON.parse(resultStr);

    expect(llmClient.generate).toHaveBeenCalledTimes(2);
    expect(result.type).toBe('quiz');
    expect(result.topic).toBe('\u519c\u573a\u52a8\u7269\u7ec3\u4e60');
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0].correctIndex).toBe(1);
    expect(result.questions[0].options[result.questions[0].correctIndex]).toBe('\u5976\u725b');
  });

  it('fails after retries when content is clearly off-topic', async () => {
    llmClient.generate.mockResolvedValue(JSON.stringify({
      title: '\u4eca\u5929\u5929\u6c14',
      questions: [
        {
          question: '\u767d\u5929\u592a\u9633\u4ece\u54ea\u91cc\u51fa\u6765\uff1f',
          options: ['\u4e1c\u8fb9', '\u897f\u8fb9', '\u4e0b\u9762'],
          correctIndex: 0,
          explanation: '\u767d\u5929\u53ef\u4ee5\u770b\u5230\u592a\u9633\u3002',
        },
        {
          question: '\u665a\u4e0a\u6700\u5e38\u770b\u5230\u4ec0\u4e48\uff1f',
          options: ['\u6708\u4eae', '\u82f9\u679c', '\u4e66\u5305'],
          correctIndex: 0,
          explanation: '\u665a\u4e0a\u80fd\u770b\u5230\u6708\u4eae\u3002',
        },
        {
          question: '1+1\u7b49\u4e8e\u51e0\uff1f',
          options: ['2', '3', '4'],
          correctIndex: 0,
          explanation: '1+1=2',
        },
      ],
    }));

    await expect(tool.execute({
      type: 'quiz',
      topic: '\u519c\u573a\u52a8\u7269\u7ec3\u4e60',
      difficulty: 1,
      ageGroup: '3-4',
    })).rejects.toThrow('Unable to generate a topic-aligned activity');

    expect(llmClient.generate).toHaveBeenCalledTimes(3);
  });

  it('does not fallback when model output is never parseable JSON', async () => {
    llmClient.generate.mockResolvedValue('not-json-at-all');

    await expect(tool.execute({
      type: 'quiz',
      topic: '\u52a8\u7269\u4f4f\u5728\u54ea\u91cc',
      difficulty: 1,
      ageGroup: '3-4',
    })).rejects.toThrow('Unable to generate a topic-aligned activity');

    expect(llmClient.generate).toHaveBeenCalledTimes(3);
  });
});
