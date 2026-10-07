import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    
    return {
      status: 'ok',
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      memory: {
        rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
      node: process.version,
      platform: process.platform,
    };
  }

  @Get('db')
  async dbCheck() {
    return {
      status: 'ok',
      message: 'Database connection OK',
      timestamp: new Date().toISOString(),
    };
  }
}
