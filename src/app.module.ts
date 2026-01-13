import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import envConfig from './config/env.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
  ],
})
export class AppModule {}
