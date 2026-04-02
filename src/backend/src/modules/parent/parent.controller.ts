import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
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

  @Patch('controls/:parentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新家长控制设置' })
  async update(@Param('parentId') parentId: string, @Body() body: any) {
    // Find or create controls for this parent
    const controls = await this.parentService.getByParent(+parentId);
    if (controls.id === 0) {
      // No existing controls — create with defaults including required fields
      const created = await this.parentService.createWithDefaults(+parentId);
      if (Object.keys(body).length > 0) {
        return this.parentService.update(created.id, body);
      }
      return created;
    }
    return this.parentService.update(controls.id, body);
  }
}