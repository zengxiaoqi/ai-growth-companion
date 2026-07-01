import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 获取当前家长的孩子列表
  @Get('children')
  @UseGuards(JwtAuthGuard)
  async getChildren(@Request() req) {
    const parentId = req.user.sub;
    return this.usersService.findByParentId(parentId);
  }

  // 添加孩子
  @Post('child')
  @UseGuards(JwtAuthGuard)
  async addChild(
    @Request() req,
    @Body() body: { name: string; phone?: string; age?: number; gender?: string },
  ) {
    const parentId = req.user.sub;
    return this.usersService.addChild(parentId, body);
  }

  // 更新孩子信息
  @Put('child/:id')
  @UseGuards(JwtAuthGuard)
  async updateChild(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { name?: string; phone?: string; age?: number; gender?: string },
  ) {
    const parentId = req.user.sub;
    return this.usersService.updateChild(parentId, parseInt(id), body);
  }

  // 删除孩子
  @Delete('child/:id')
  @UseGuards(JwtAuthGuard)
  async deleteChild(@Request() req, @Param('id') id: string) {
    const parentId = req.user.sub;
    await this.usersService.deleteChild(parentId, parseInt(id));
    return { success: true };
  }

  // 获取当前用户信息
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req) {
    return this.usersService.findSafeById(req.user.sub);
  }

  // 通过手机号+验证码关联孩子账号
  @Post('link-child')
  @UseGuards(JwtAuthGuard)
  async linkChild(@Request() req, @Body() body: { childPhone: string; loginCode: string }) {
    const parentId = req.user.sub;
    return this.usersService.linkChild(parentId, body.childPhone, body.loginCode);
  }

  // 重新生成孩子的登录验证码
  @Post('child/:id/regenerate-code')
  @UseGuards(JwtAuthGuard)
  async regenerateLoginCode(@Request() req, @Param('id') id: string) {
    const parentId = req.user.sub;
    return this.usersService.regenerateLoginCode(parentId, parseInt(id));
  }
}
