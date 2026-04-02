import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/build-openapi-document';

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
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors(
    corsOrigins?.length
      ? { origin: corsOrigins, credentials: true }
      : { origin: true, credentials: true },
  );

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
}
bootstrap();
