import { Injectable } from "@nestjs/common";
import { AbilitiesService } from "../../../abilities/abilities.service";

@Injectable()
export class GetAbilitiesTool {
  constructor(private readonly abilitiesService: AbilitiesService) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const assessments = await this.abilitiesService.getByUser(args.childId);
      if (!assessments || assessments.length === 0) {
        return JSON.stringify({ message: "暂无能力评估数据", abilities: [] });
      }

      const abilities = assessments.map((a) => ({
        domain: a.domain,
        score: a.score,
        level: a.level,
      }));

      return JSON.stringify({ abilities });
    } catch (error) {
      return JSON.stringify({ error: `获取能力评估失败: ${error.message}` });
    }
  }
}
