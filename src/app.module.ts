import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import envConfig from './config/env.config';
import { AppController } from './app.controller';
import { OpenAIService } from './common/openai/openai.service';
import { IngestionModule } from './ingestion/ingestion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [OpenAIService],
})
export class AppModule {}
