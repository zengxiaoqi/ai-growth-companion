import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 全局前缀
  app.setGlobalPrefix('api');
  
  // 开启 CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  // 全局异常过滤 — log errors in dev
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    enableDebugMessages: true,
  }));
  
  // Swagger 文档
  const config = new DocumentBuilder()
    .setTitle('灵犀伴学 API')
    .setDescription('AI 儿童成长陪伴平台后端 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 灵犀伴学 API 已启动: http://localhost:${port}`);
  console.log(`📚 Swagger 文档: http://localhost:${port}/api/docs`);
}
bootstrap();