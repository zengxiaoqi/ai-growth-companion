import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression');
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loggerConfig } from './common/logger.module';
import {
  InstanceBusyError,
  announcePortOwner,
  installProcessGuards,
  releaseInstanceLock,
  waitForExclusiveAccess,
  workerSnapshot,
} from './common/instance-guard';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  installProcessGuards({
    onFatal: (error) => logger.error(`致命错误: ${(error as any)?.message || error}`),
  });

  /**
   * 顺序要紧：**先确定自己是唯一实例，再把 Nest 造出来**。
   *
   * `NestFactory.create` 会同步跑完所有 OnModuleInit，其中出片队列会启动定时器
   * 并复位"僵尸 processing 任务"。如果先 create 再 listen，抢不到端口的进程
   * 已经把在渲染的任务打回 pending 了 —— 一次失败的重启就能让 attemptCount
   * 白涨一格，且没人察觉。把这两步挪到 create 之前，失败者连副作用都没有。
   *
   * 等待窗口（默认 8s）是为 `nest start --watch` 的换班留的：杀旧进程和起新进程
   * 是两条独立动作，新进程常常在旧进程还没释放端口时启动。只等待，不杀任何进程。
   */
  try {
    await waitForExclusiveAccess({
      port,
      host,
      // 留空走默认值；写错（非数字）由 guard 内部回落到默认，不会变成 NaN 死等
      timeoutMs: process.env.INSTANCE_WAIT_MS
        ? Number(process.env.INSTANCE_WAIT_MS)
        : undefined,
    });
  } catch (error: any) {
    if (error instanceof InstanceBusyError && error.reason === 'port') {
      logger.error(
        `端口 ${port} 已被占用：本进程立即退出。` +
          `另一个后端实例正在运行（netstat -ano | findstr :${port} 查看 PID）。` +
          `若不退出，它的队列定时器会与本进程互抢任务，表现为"任务一直 pending、进度不动"。`,
      );
    } else if (error instanceof InstanceBusyError) {
      const owner = error.owner;
      logger.error(
        `已有后端实例持有单实例锁（pid=${owner?.pid ?? '?'}, port=${owner?.port ?? '?'}, ` +
          `startedAt=${owner?.startedAt || '?'}, file=${error.file}）。本进程立即退出。` +
          `确认该进程确实需要停止后再结束它（kill ${owner?.pid ?? '<pid>'}），锁会随进程退出释放。`,
      );
    } else {
      logger.error(`取得单实例访问权失败: ${error?.message || error}`);
    }
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: loggerConfig,
  });

  // 全局前缀
  app.setGlobalPrefix('api');

  // 启用 gzip/brotli 压缩（必须在静态文件之前）
  // 对 SSE 流式响应禁用压缩，否则 compression 中间件会缓冲所有数据导致不实时推送
  app.use(
    compression({
      filter: (req, res) => {
        const contentType = res.getHeader('Content-Type');
        if (contentType && contentType.includes('text/event-stream')) {
          return false; // 不压缩 SSE
        }
        return compression.filter(req, res);
      },
    }),
  );

  // 静态文件服务（Web 前端）
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/',
    setHeaders: (res, filePath) => {
      // main.dart.js 不使用长期缓存（Flutter Web 构建不生成哈希）
      if (filePath.endsWith('main.dart.js')) {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
      // 带哈希的静态资源（.wasm/字体/图片）：长期缓存
      else if (filePath.match(/\.(wasm|woff2?|ttf|otf)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  });

  // SPA 回退：非 /api 路径且非静态资源文件，返回 index.html
  app.getHttpAdapter().get('*', (req: any, res: any, next: any) => {
    if (req.path.startsWith('/api')) return next();
    // 有文件后缀的请求（.js/.wasm/.png/.json 等）交给 express.static 处理
    if (req.path.includes('.')) return next();
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
  });

  // CORS：优先使用白名单。字面量 '*' 与 credentials:true 组合会被浏览器拒绝，
  // 且等于把儿童数据相关接口开放给任意站点，因此不再使用。
  const isProduction = process.env.NODE_ENV === 'production';
  const corsAllowlist = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // curl / 健康检查 / 服务端调用没有 Origin 头，直接放行
      if (!origin) return callback(null, true);
      if (corsAllowlist.length > 0) {
        return callback(null, corsAllowlist.includes(origin));
      }
      if (!isProduction) return callback(null, true);
      // 兼容尚未配置 CORS_ORIGINS 的现存部署：反射调用方来源而非返回 '*'，
      // 保证 credentials:true 生效；启动时下方会打印加固提醒。
      return callback(null, origin);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger 文档：生产环境默认关闭，避免向公网暴露完整 API 清单
  // （包含家长/儿童账号、学习记录等接口）。需要时显式设置 SWAGGER_ENABLED=true。
  const swaggerEnabled = !isProduction || process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('灵犀伴学 API')
      .setDescription('AI 儿童成长陪伴平台后端 API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  try {
    await app.listen(port, host);
  } catch (error: any) {
    // 走到这里说明"先探测再绑定"之间被别的进程插队了（TOCTOU）。
    // 必须立刻退出：此时队列定时器已经在跑，留着就是一个只抢任务不出片的僵尸。
    logger.error(`端口 ${port} 绑定失败（${error?.code || error?.message}），本进程退出`);
    releaseInstanceLock();
    process.exit(1);
  }

  // 端口到手，才算真正"上岗"：队列从这里开始允许认领任务
  announcePortOwner(port);
  // SIGINT/SIGTERM 触发 OnModuleDestroy，让队列定时器和渲染子进程有机会收尾
  app.enableShutdownHooks();

  logger.log(`灵犀伴学 API 已启动: http://localhost:${port}`);
  const worker = workerSnapshot();
  logger.log(
    `出片队列归属: pid=${worker.pid}, port=${worker.port}, lock=${worker.lockFile || '(none)'}`,
  );
  if (swaggerEnabled) {
    logger.log(`Swagger 文档: http://localhost:${port}/api/docs`);
  }
  if (isProduction && corsAllowlist.length === 0) {
    logger.warn(
      'CORS_ORIGINS 未配置，当前为兼容模式（反射任意来源）。建议配置自有域名白名单。',
    );
  }
}

bootstrap().catch((error) => {
  // 没有这个 catch，启动期异常会变成未处理的 Promise 拒绝：锁不释放、
  // 退出原因不明，下一次启动还会被自己的陈旧锁挡住。
  // eslint-disable-next-line no-console
  console.error('[bootstrap] 启动失败:', error);
  releaseInstanceLock();
  process.exit(1);
});
