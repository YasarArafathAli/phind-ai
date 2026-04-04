import type { INestApplication } from '@nestjs/common';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';
import { createConfiguredNestApp } from '../src/bootstrap-app';

// Reuse one Nest instance per warm serverless isolate (saves cold starts after the first request).
let cachedApp: INestApplication | undefined;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!cachedApp) {
    cachedApp = await createConfiguredNestApp();
    await cachedApp.init();
  }
  const expressApp = cachedApp.getHttpAdapter().getInstance() as Express;
  expressApp(req, res);
}
