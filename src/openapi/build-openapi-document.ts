import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Single source of truth for Swagger / OpenAPI document (used by `main.ts` and `scripts/export-openapi.ts`).
 */
export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('AI Doc Chat Backend API')
    .setDescription(
      'Document ingestion, RAG chat, and health endpoints. ' +
        'Regenerate `openapi/openapi.json` with `npm run openapi:export`.',
    )
    .setVersion('1.0')
    .addTag('API', 'Plain chat and legacy entrypoints')
    .addTag('Chat', 'RAG and document-grounded chat')
    .addTag('Health', 'Liveness and readiness')
    .addTag('Ingestion', 'Google Drive OAuth and document pipeline')
    .build();

  return SwaggerModule.createDocument(app, config);
}
