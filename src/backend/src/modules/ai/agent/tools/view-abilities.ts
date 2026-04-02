import { Injectable } from '@nestjs/common';
import { AbilitiesService } from '../../../abilities/abilities.service';
import { ReportService } from '../../../report/report.service';

@Injectable()
export class ViewAbilitiesTool {
  constructor(
    private readonly abilitiesService: AbilitiesService,
    private readonly reportService: ReportService,
  ) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const [abilities, trend] = await Promise.all([
        this.abilitiesService.getByUser(args.childId),
        this.reportService.getAbilityTrend(args.childId, 4),
      ]);

      const domainLabels: Record<string, string> = {
        language: '语言表达',
        math: '数学逻辑',
        science: '科学探索',
        art: '艺术创造',
        social: '社会交往',
      };

      return JSON.stringify({
        abilities: abilities.map(a => ({
          domain: a.domain,
          domainLabel: domainLabels[a.domain] || a.domain,
          score: a.score,
          level: a.level,
        })),
        trend,
      });
    } catch (error) {
      return JSON.stringify({ error: `获取能力数据失败: ${error.message}` });
    }
  }
}