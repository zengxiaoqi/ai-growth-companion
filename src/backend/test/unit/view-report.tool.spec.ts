import { ViewReportTool } from '../../src/modules/ai/agent/tools/view-report';

describe('ViewReportTool', () => {
  const reportService = { generateReport: jest.fn() };
  let tool: ViewReportTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new ViewReportTool(reportService as any);
  });

  it('returns report with default weekly period', async () => {
    reportService.generateReport.mockResolvedValue({
      totalLearningTime: 120,
      totalLessonsCompleted: 5,
      averageScore: 85,
      streak: 3,
      skillProgress: [{ domain: 'math', progress: 70 }],
      insights: ['数学进步明显'],
      summary: '本周表现良好',
    });

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.period).toBe('weekly');
    expect(result.totalLearningTime).toBe(120);
    expect(result.totalLessonsCompleted).toBe(5);
    expect(result.averageScore).toBe(85);
    expect(result.streak).toBe(3);
    expect(result.insights).toEqual(['数学进步明显']);
    expect(reportService.generateReport).toHaveBeenCalledWith({
      userId: 1,
      period: 'weekly',
    });
  });

  it('uses specified period', async () => {
    reportService.generateReport.mockResolvedValue({
      totalLearningTime: 0,
      totalLessonsCompleted: 0,
      averageScore: 0,
      streak: 0,
      skillProgress: [],
      insights: [],
      summary: '',
    });

    await tool.execute({ childId: 1, period: 'daily' });
    expect(reportService.generateReport).toHaveBeenCalledWith({
      userId: 1,
      period: 'daily',
    });
  });

  it('supports monthly period', async () => {
    reportService.generateReport.mockResolvedValue({
      totalLearningTime: 0,
      totalLessonsCompleted: 0,
      averageScore: 0,
      streak: 0,
      skillProgress: [],
      insights: [],
      summary: '',
    });

    await tool.execute({ childId: 1, period: 'monthly' });
    expect(reportService.generateReport).toHaveBeenCalledWith({
      userId: 1,
      period: 'monthly',
    });
  });

  it('returns error on service exception', async () => {
    reportService.generateReport.mockRejectedValue(new Error('fail'));

    const result = JSON.parse(await tool.execute({ childId: 1 }));
    expect(result.error).toContain('获取报告失败');
  });
});
