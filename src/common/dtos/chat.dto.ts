import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsNumber,
} from 'class-validator';
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

/** One retrieved chunk cited in a RAG response */
export class RagSourceDto {
  @ApiProperty({ description: 'Chunk identifier', example: 'chunk_google_docs_abc_0' })
  chunkId: string;

  @ApiProperty({ description: 'Document identifier', example: 'google_docs_abc' })
  documentId: string;

  @ApiProperty({
    description: 'Cosine similarity score (higher is more relevant)',
    example: 0.82,
  })
  score: number;

  @ApiPropertyOptional({ description: 'Document title when available' })
  title?: string;

  @ApiPropertyOptional({ description: 'Source system (e.g. google_docs)' })
  source?: string;

  @ApiProperty({
    description: 'Short excerpt of the chunk text used as context',
    example: 'The project deadline is set for Q2...',
  })
  excerpt: string;
}

export class RagChatRequestDto {
  @ApiProperty({
    description: 'The question to answer using your indexed documents',
    example: 'What is the main conclusion?',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Prior conversation turns (the current question is `message` only)',
    type: [ChatMessageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages?: ChatMessageDto[];

  @ApiPropertyOptional({
    description: 'Number of chunks to retrieve (1-20)',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional({
    description: 'Minimum similarity score (0-1); higher filters more strictly',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;

  @ApiPropertyOptional({
    description: 'If set, only search chunks from these document IDs',
    example: ['google_docs_abc123'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];
}

export class RagChatResponseDto {
  @ApiProperty({
    description: 'Answer based on retrieved document context',
  })
  message: string;

  @ApiProperty({
    description: 'Chunks that were supplied to the model as context',
    type: [RagSourceDto],
  })
  sources: RagSourceDto[];

  @ApiProperty({
    description: 'Token usage for the completion call',
    type: UsageDto,
  })
  usage: UsageDto;
}
