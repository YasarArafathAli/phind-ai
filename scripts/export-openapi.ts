/**
 * Writes `openapi/openapi.json` for client codegen (openapi-typescript).
 * Run from repo root: cd ai-doc-chat-backend && npm run openapi:export
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/openapi/build-openapi-document';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);
  const outDir = join(__dirname, '..', 'openapi');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'openapi.json');
  writeFileSync(outFile, JSON.stringify(document, null, 2), 'utf-8');
  await app.close();
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
