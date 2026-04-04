
import '@nestjs/core';

import { ConfigService } from '@nestjs/config';
import { createConfiguredNestApp } from './bootstrap-app';

async function bootstrap() {
  const app = await createConfiguredNestApp();
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3001;
  await app.listen(port);
}
bootstrap();
