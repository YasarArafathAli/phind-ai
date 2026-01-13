import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

export const createOpenAIClient = (config: ConfigService) => {
  return new OpenAI({
    apiKey: config.get<string>('openai.apiKey'),
  });
};
