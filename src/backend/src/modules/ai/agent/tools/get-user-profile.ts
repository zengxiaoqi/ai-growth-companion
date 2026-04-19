import { Injectable } from "@nestjs/common";
import { UsersService } from "../../../users/users.service";

@Injectable()
export class GetUserProfileTool {
  constructor(private readonly usersService: UsersService) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const user = await this.usersService.findById(args.childId);
      if (!user) return JSON.stringify({ error: "用户不存在" });

      return JSON.stringify({
        name: user.name,
        age: user.age,
        gender: user.gender,
        avatar: user.avatar,
      });
    } catch (error) {
      return JSON.stringify({ error: `获取用户信息失败: ${error.message}` });
    }
  }
}
