import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { OpenAIService } from './common/openai/openai.service';
import { ConfigService } from '@nestjs/config';
import { ChatRequestDto, ChatResponseDto } from './common/dtos/chat.dto';

/** Plain chat only; use HealthModule for GET /health. */
@ApiTags('API')
@Controller()
export class AppController {
  constructor(
    private readonly openAIService: OpenAIService,
    private readonly configService: ConfigService,
  ) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Send a message to OpenAI and get a response',
    description:
      'This endpoint sends a message to OpenAI API and returns the AI response. You can optionally provide conversation history for context.',
  })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully received response from OpenAI',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - message is required',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to get response from OpenAI',
  })
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    try {
      // Validate input
      if (!body.message) {
        throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
      }

      const client = this.openAIService.getClient();
      const model =
        this.configService.get<string>('openai.model') || 'gpt-3.5-turbo';

      // Build messages array
      const messages = body.messages || [];
      messages.push({ role: 'user', content: body.message });

      // Call OpenAI API
      const completion = await client.chat.completions.create({
        model,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })) as Array<{
          role: 'user' | 'assistant' | 'system';
          content: string;
        }>,
      });

      // Extract the response
      const response = completion.choices[0]?.message?.content;

      if (!response) {
        throw new HttpException(
          'No response from OpenAI',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Handle usage information
      const usage = completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };

      // Return the response
      return {
        message: response,
        usage,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to get response from OpenAI';
      throw new HttpException(
        message || 'Failed to get response from OpenAI',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
