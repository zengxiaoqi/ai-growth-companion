import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ParentService } from './parent.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('家长控制')
@Controller('parent')
export class ParentController {
  constructor(private parentService: ParentService) {}

  @Get('controls/:parentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取家长控制设置' })
  async getControls(@Param('parentId') parentId: string) {
    return this.parentService.getByParent(+parentId);
  }

  @Post('controls')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建家长控制' })
  async create(@Body() body: { parentId: number; childId: number }) {
    return this.parentService.create(body.parentId, body.childId);
  }

  @Put('controls/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新家长控制设置' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.parentService.update(+id, body);
  }
}