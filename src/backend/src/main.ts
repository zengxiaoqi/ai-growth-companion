import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe, Logger } from "@nestjs/common";
import { join } from "path";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { loggerConfig } from "./common/logger.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: loggerConfig,
  });

  // 全局前缀
  app.setGlobalPrefix("api");

  // 静态文件服务（Web 前端）
  app.useStaticAssets(join(__dirname, "..", "public"), {
    prefix: "/",
  });

  // SPA 回退：非 /api 路径且非静态资源文件，返回 index.html
  app.getHttpAdapter().get("*", (req: any, res: any, next: any) => {
    if (req.path.startsWith("/api")) return next();
    // 有文件后缀的请求（.js/.wasm/.png/.json 等）交给 express.static 处理
    if (req.path.includes(".")) return next();
    res.sendFile(join(__dirname, "..", "public", "index.html"));
  });

  // 开启 CORS
  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  });

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger 文档
  const config = new DocumentBuilder()
    .setTitle("灵犀伴学 API")
    .setDescription("AI 儿童成长陪伴平台后端 API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  await app.listen(port, host);
  const logger = new Logger("Bootstrap");
  logger.log(`灵犀伴学 API 已启动: http://localhost:${port}`);
  logger.log(`Swagger 文档: http://localhost:${port}/api/docs`);
}
bootstrap();
