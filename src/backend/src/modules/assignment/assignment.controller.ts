import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AssignmentService } from './assignment.service';

@ApiTags('任务布置')
@Controller('assignments')
@UseGuards(JwtAuthGuard)
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post()
  @ApiOperation({ summary: '家长创建布置任务' })
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
  @ApiOperation({ summary: '获取孩子的任务列表' })
  async findByChild(@Param('childId') childId: string) {
    return this.assignmentService.findByChild(+childId);
  }

  @Get('parent/:parentId')
  @ApiOperation({ summary: '家长查看所有布置' })
  async findByParent(@Param('parentId') parentId: string) {
    return this.assignmentService.findByParent(+parentId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  async findById(@Param('id') id: string) {
    return this.assignmentService.findById(+id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: '孩子完成任务' })
  async complete(
    @Param('id') id: string,
    @Body() body: { score: number; resultData?: any },
  ) {
    return this.assignmentService.complete(+id, body);
  }
}
