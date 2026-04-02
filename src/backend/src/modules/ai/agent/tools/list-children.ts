import { Injectable } from '@nestjs/common';
import { UsersService } from '../../../users/users.service';

@Injectable()
export class ListChildrenTool {
  constructor(private readonly usersService: UsersService) {}

  async execute(args: { parentId: number }): Promise<string> {
    try {
      const children = await this.usersService.findByParentId(args.parentId);
      return JSON.stringify({
        children: children.map(c => ({
          id: c.id,
          name: c.name,
          age: c.age,
          gender: c.gender,
          avatar: c.avatar,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: `获取孩子列表失败: ${error.message}` });
    }
  }
}