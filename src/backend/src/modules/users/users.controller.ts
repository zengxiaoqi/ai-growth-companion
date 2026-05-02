import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Post,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@ApiTags("用户管理")
@Controller("users")
export class UsersController {
  constructor(private usersService: UsersService) {}

  // ⚠️ 具体路由必须在参数路由之前定义，否则 /users/children/1 会被 :id 拦截
  @Get("children/:parentId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "获取家长的孩子列表" })
  async findChildren(@Param("parentId") parentId: string) {
    return this.usersService.findByParentId(+parentId);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "获取用户信息" })
  async findOne(@Param("id") id: string) {
    return this.usersService.findSafeById(+id);
  }

  @Put(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "更新用户信息" })
  async update(@Param("id") id: string, @Body() userData: any) {
    return this.usersService.update(+id, userData);
  }

  @Post("link-child")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "通过手机号关联孩子账号" })
  async linkChild(@Request() req: any, @Body() body: { childPhone: string }) {
    const parentId = req.user.sub;
    return this.usersService.linkChild(parentId, body.childPhone);
  }
}
