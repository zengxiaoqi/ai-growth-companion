import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Subscription } from 'rxjs';
import { SseService } from './sse.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('实时事件')
@Controller('sse')
export class SseController {
  constructor(private sseService: SseService) {}

  @Get('subscribe/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SSE 订阅实时事件' })
  subscribe(@Param('userId') userId: string, @Req() req: Request, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const subject = this.sseService.addClient(+userId);
    const subscription: Subscription = subject.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      complete: () => {
        res.end();
      },
    });

    // Send initial heartbeat
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', data: { ts: Date.now() } })}\n\n`);

    // Cleanup on disconnect
    req.on('close', () => {
      subscription.unsubscribe();
      this.sseService.removeClient(+userId);
    });
  }
}
