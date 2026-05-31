import { ReportController } from '../../src/modules/report/report.controller';

describe('ReportController', () => {
  const reportService = {
    generateReport: jest.fn(),
    getAbilityTrend: jest.fn(),
    getRecentMasteredSkills: jest.fn(),
  };

  let controller: ReportController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ReportController(reportService as any);
  });

  describe('GET /report', () => {
    it('generates weekly report by default', async () => {
      const report = { period: 'weekly', summary: 'Great progress' };
      reportService.generateReport.mockResolvedValue(report);

      const result = await controller.generateReport('2');

      expect(result).toEqual(report);
      expect(reportService.generateReport).toHaveBeenCalledWith({
        userId: 2,
        period: 'weekly',
      });
    });

    it('generates daily report', async () => {
      reportService.generateReport.mockResolvedValue({ period: 'daily' });

      await controller.generateReport('2', 'daily');

      expect(reportService.generateReport).toHaveBeenCalledWith({
        userId: 2,
        period: 'daily',
      });
    });

    it('generates monthly report', async () => {
      reportService.generateReport.mockResolvedValue({ period: 'monthly' });

      await controller.generateReport('3', 'monthly');

      expect(reportService.generateReport).toHaveBeenCalledWith({
        userId: 3,
        period: 'monthly',
      });
    });
  });

  describe('GET /report/trend', () => {
    it('returns ability trend with default 6 weeks', async () => {
      const trend = [
        { week: 1, score: 70 },
        { week: 2, score: 75 },
      ];
      reportService.getAbilityTrend.mockResolvedValue(trend);

      const result = await controller.getAbilityTrend('2');

      expect(result).toEqual(trend);
      expect(reportService.getAbilityTrend).toHaveBeenCalledWith(2, 6);
    });

    it('returns ability trend with custom weeks', async () => {
      reportService.getAbilityTrend.mockResolvedValue([]);

      await controller.getAbilityTrend('2', '12');

      expect(reportService.getAbilityTrend).toHaveBeenCalledWith(2, 12);
    });
  });

  describe('GET /report/recent-skills', () => {
    it('returns recent mastered skills with default limit', async () => {
      const skills = [{ name: 'counting', masteredAt: new Date() }];
      reportService.getRecentMasteredSkills.mockResolvedValue(skills);

      const result = await controller.getRecentSkills('2');

      expect(result).toEqual(skills);
      expect(reportService.getRecentMasteredSkills).toHaveBeenCalledWith(2, 3);
    });

    it('returns recent skills with custom limit', async () => {
      reportService.getRecentMasteredSkills.mockResolvedValue([]);

      await controller.getRecentSkills('2', '5');

      expect(reportService.getRecentMasteredSkills).toHaveBeenCalledWith(2, 5);
    });
  });
});
