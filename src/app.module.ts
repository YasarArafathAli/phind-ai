import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import envConfig from './config/env.config';
import { AppController } from './app.controller';
import { ChatModule } from './chat/chat.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { HealthModule } from './health/health.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    IngestionModule,
    HealthModule,
    RagModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
