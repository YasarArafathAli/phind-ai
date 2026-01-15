import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @ApiProperty({
    description: 'Role of the message sender',
    example: 'user',
    enum: ['user', 'assistant', 'system'],
  })
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant' | 'system';

  @ApiProperty({
    description: 'Content of the message',
    example: 'Hello, how are you?',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    description: 'The message to send to OpenAI',
    example: 'What is the capital of France?',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Optional conversation history for context',
    type: [ChatMessageDto],
    example: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there! How can I help you?' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages?: ChatMessageDto[];
}

export class UsageDto {
  @ApiProperty({
    description: 'Number of prompt tokens used',
    example: 10,
  })
  prompt_tokens: number;

  @ApiProperty({
    description: 'Number of completion tokens used',
    example: 20,
  })
  completion_tokens: number;

  @ApiProperty({
    description: 'Total number of tokens used',
    example: 30,
  })
  total_tokens: number;
}

export class ChatResponseDto {
  @ApiProperty({
    description: 'The response message from OpenAI',
    example: 'The capital of France is Paris.',
  })
  message: string;

  @ApiProperty({
    description: 'Token usage information',
    type: UsageDto,
  })
  usage: UsageDto;
}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Status of the API',
    example: 'ok',
  })
  status: string;

  @ApiProperty({
    description: 'Current timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;
}
