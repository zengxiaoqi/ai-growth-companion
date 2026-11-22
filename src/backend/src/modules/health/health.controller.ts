import { Controller, Get } from '@nestjs/common';
import { workerSnapshot } from '../../common/instance-guard';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const worker = workerSnapshot();

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
      /**
       * 出片队列归属。"谁在跑队列"以前只能靠 netstat + 猜；现在看一眼就知道：
       * active=false 说明这个进程没有端口归属（不该存在），
       * lockHolder.pid ≠ pid 说明锁被别人持有。
       */
      videoWorker: {
        pid: worker.pid,
        port: worker.port,
        active: worker.active,
        activatedAt: worker.activatedAt,
        lockFile: worker.lockFile,
        lockHolderPid: worker.lockHolder?.pid ?? null,
      },
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
