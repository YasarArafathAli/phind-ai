import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/build-openapi-document';

/**
 * Creates the Nest app with the same HTTP config as local `main.ts`, but does not listen.
 * Used by `main.ts` (calls `listen`) and by Vercel `api/index.ts` (calls `init` + forwards to Express).
 */
export async function createConfiguredNestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);

  // Socket.IO needs a real long-lived HTTP server; Vercel Functions are request/response only.
  if (process.env.VERCEL !== '1') {
    app.useWebSocketAdapter(new IoAdapter(app));
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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

  return app;
}
