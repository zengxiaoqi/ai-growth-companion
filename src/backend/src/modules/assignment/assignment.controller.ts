import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AssignmentService } from './assignment.service';

@ApiTags('作业管理')
@Controller('assignments')
@UseGuards(JwtAuthGuard)
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post()
  @ApiOperation({ summary: '家长创建作业' })
  async create(
    @Body() body: {
      parentId: number;
      childId: number;
      activityType: string;
      activityData?: any;
      contentId?: number;
      domain?: string;
      difficulty?: number;
      dueDate?: string;
    },
  ) {
    return this.assignmentService.create(body);
  }

  @Get('child/:childId')
  @ApiOperation({ summary: '获取孩子作业列表' })
  async findByChild(@Param('childId') childId: string) {
    return this.assignmentService.findByChild(+childId);
  }

  @Get('parent/:parentId')
  @ApiOperation({ summary: '获取家长全部作业' })
  async findByParent(@Param('parentId') parentId: string) {
    return this.assignmentService.findByParent(+parentId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取作业详情' })
  async findById(@Param('id') id: string) {
    return this.assignmentService.findById(+id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: '孩子完成作业' })
  async complete(
    @Param('id') id: string,
    @Body() body: { score: number; resultData?: any },
  ) {
    return this.assignmentService.complete(+id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: '家长编辑待完成作业' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: {
      activityType?: string;
      activityData?: any;
      domain?: string;
      difficulty?: number;
      dueDate?: string | null;
      topic?: string;
    },
  ) {
    return this.assignmentService.update(+id, req.user.sub, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '家长删除待完成作业' })
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.assignmentService.remove(+id, req.user.sub);
  }
}
