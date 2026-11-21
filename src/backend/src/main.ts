import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression');
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loggerConfig } from './common/logger.module';

async function bootstrap() {
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

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  const logger = new Logger('Bootstrap');
  logger.log(`灵犀伴学 API 已启动: http://localhost:${port}`);
  if (swaggerEnabled) {
    logger.log(`Swagger 文档: http://localhost:${port}/api/docs`);
  }
  if (isProduction && corsAllowlist.length === 0) {
    logger.warn(
      'CORS_ORIGINS 未配置，当前为兼容模式（反射任意来源）。建议配置自有域名白名单。',
    );
  }
}
bootstrap();
