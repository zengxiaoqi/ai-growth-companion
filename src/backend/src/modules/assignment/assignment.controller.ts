import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { AssignmentService } from './assignment.service';

@ApiTags('作业管理')
@Controller('assignments')
@UseGuards(JwtAuthGuard)
export class AssignmentController {
  constructor(
    private readonly assignmentService: AssignmentService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @ApiOperation({ summary: '家长创建作业' })
  async create(
    @Request() req: any,
    @Body()
    body: {
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
    if (req.user.type !== 'parent') {
      throw new ForbiddenException('Only parent can create assignments');
    }

    return this.assignmentService.create({
      ...body,
      parentId: req.user.sub,
    });
  }

  @Get('child/:childId')
  @ApiOperation({ summary: '获取孩子作业列表' })
  async findByChild(@Request() req: any, @Param('childId') childId: string) {
    const childIdNum = +childId;

    if (req.user.type === 'child') {
      if (req.user.sub !== childIdNum) {
        throw new ForbiddenException('You can only view your own assignments');
      }
      return this.assignmentService.findByChild(childIdNum);
    }

    if (req.user.type === 'parent') {
      const canAccess = await this.usersService.canAccessChild(req.user.sub, req.user.type, childIdNum);
      if (!canAccess) {
        throw new ForbiddenException('You can only view assignments of your own children');
      }
      return this.assignmentService.findByChild(childIdNum);
    }

    throw new ForbiddenException('Unsupported user type');
  }

  @Get('parent/:parentId')
  @ApiOperation({ summary: '获取家长全部作业' })
  async findByParent(@Request() req: any, @Param('parentId') parentId: string) {
    const parentIdNum = +parentId;
    if (req.user.type !== 'parent') {
      throw new ForbiddenException('Only parent can view parent assignments');
    }
    if (req.user.sub !== parentIdNum) {
      throw new ForbiddenException('You can only view your own assignments');
    }
    return this.assignmentService.findByParent(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取作业详情' })
  async findById(@Request() req: any, @Param('id') id: string) {
    const assignment = await this.assignmentService.findById(+id);

    if (req.user.type === 'parent') {
      if (assignment.parentId !== req.user.sub) {
        throw new ForbiddenException('You can only view your own child assignments');
      }
      return assignment;
    }

    if (req.user.type === 'child') {
      if (assignment.childId !== req.user.sub) {
        throw new ForbiddenException('You can only view your own assignments');
      }
      return assignment;
    }

    throw new ForbiddenException('Unsupported user type');
  }

  @Post(':id/complete')
  @ApiOperation({ summary: '孩子完成作业' })
  async complete(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { score: number; resultData?: any },
  ) {
    if (req.user.type !== 'child') {
      throw new ForbiddenException('Only child can complete assignments');
    }

    const assignment = await this.assignmentService.findById(+id);
    if (assignment.childId !== req.user.sub) {
      throw new ForbiddenException('You can only complete your own assignments');
    }

    return this.assignmentService.complete(+id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: '家长编辑待完成作业' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      activityType?: string;
      activityData?: any;
      domain?: string;
      difficulty?: number;
      dueDate?: string | null;
      topic?: string;
    },
  ) {
    if (req.user.type !== 'parent') {
      throw new ForbiddenException('Only parent can update assignments');
    }
    return this.assignmentService.update(+id, req.user.sub, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '家长删除待完成作业' })
  async remove(@Request() req: any, @Param('id') id: string) {
    if (req.user.type !== 'parent') {
      throw new ForbiddenException('Only parent can delete assignments');
    }
    return this.assignmentService.remove(+id, req.user.sub);
  }
}
