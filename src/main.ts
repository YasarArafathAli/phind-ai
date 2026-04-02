import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3001;

  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Browser clients (Next.js) use axios withCredentials; reflect Origin + credentials for local dev.
  // For production, set CORS_ORIGINS to a comma-separated allowlist instead of origin: true.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors(
    corsOrigins?.length
      ? { origin: corsOrigins, credentials: true }
      : { origin: true, credentials: true },
  );

  // Swagger API Documentation setup
  const config = new DocumentBuilder()
    .setTitle('AI Doc Chat Backend API')
    .setDescription('API documentation for AI Document Chat Backend service. This API provides endpoints for interacting with OpenAI chat completions.')
    .setVersion('1.0')
    .addTag('API', 'Main API endpoints')
    .addTag('Chat', 'RAG and document-grounded chat')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
}
bootstrap();
