import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createOpenAIClient } from '../../config/openai.config';

@Injectable()
export class OpenAIService {
  private client: OpenAI;

  constructor(private configService: ConfigService) {
    this.client = createOpenAIClient(this.configService);
  }

  getClient() {
    return this.client;
  }
}
