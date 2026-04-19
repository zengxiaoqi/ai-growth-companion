import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { RecommendService } from "./recommend.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Controller("recommend")
export class RecommendController {
  constructor(private readonly recommendService: RecommendService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async recommend(
    @Query("userId") userId: string,
    @Query("ageRange") ageRange: string,
  ) {
    return this.recommendService.recommend({
      userId: +userId,
      ageRange: ageRange || "3-4",
    });
  }
}
