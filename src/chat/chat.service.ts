import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIService } from '../common/openai/openai.service';
import {
  ChatRequestDto,
  RagChatRequestDto,
  RagChatResponseDto,
  RagSourceDto,
  UsageDto,
} from '../common/dtos/chat.dto';
import { EmbeddingService } from '../rag/embedding.service';
import { PromptBuilderService } from '../rag/prompt-builder.service';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { SearchResult } from '../rag/types';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const EXCERPT_LEN = 280;

type RagContext = {
  searchResults: SearchResult[];
  completionMessages: ChatCompletionMessageParam[];
  model: string;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly openAIService: OpenAIService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * RAG: embed question, retrieve chunks, build prompt, return answer with source references.
   */
  async ragChat(body: RagChatRequestDto): Promise<RagChatResponseDto> {
    const { searchResults, completionMessages, model } =
      await this.buildRagContext(body);

    const client = this.openAIService.getClient();

    this.logger.log(
      `RAG chat: model=${model}, chunks=${searchResults.length}, priorTurns=${(body.messages || []).length}`,
    );

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: completionMessages,
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw new HttpException(
          'No response from OpenAI',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const usage = this.mapUsage(completion.usage);

      return {
        message: text,
        sources: this.toSources(searchResults),
        usage,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('RAG chat completion failed', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'RAG chat failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Same as POST /chat/rag but streams completion tokens via `onDelta`; final payload in `onFinish`.
   */
  async streamRagChat(
    body: RagChatRequestDto,
    sink: {
      onDelta: (delta: string) => void;
      onFinish: (result: RagChatResponseDto) => void;
    },
  ): Promise<void> {
    const { searchResults, completionMessages, model } =
      await this.buildRagContext(body);
    const client = this.openAIService.getClient();

    this.logger.log(
      `RAG stream: model=${model}, chunks=${searchResults.length}, priorTurns=${(body.messages || []).length}`,
    );

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: completionMessages,
        stream: true,
        stream_options: { include_usage: true },
      });

      let full = '';
      let usage: UsageDto = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          sink.onDelta(delta);
        }
        if (chunk.usage) {
          usage = this.mapUsage(chunk.usage);
        }
      }

      sink.onFinish({
        message: full,
        sources: this.toSources(searchResults),
        usage,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('RAG stream failed', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'RAG stream failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Plain OpenAI chat with streaming (no document retrieval).
   */
  async streamPlainChat(
    body: Pick<ChatRequestDto, 'message' | 'messages'>,
    sink: {
      onDelta: (delta: string) => void;
      onFinish: (result: { message: string; usage: UsageDto }) => void;
    },
  ): Promise<void> {
    if (!body.message?.trim()) {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }

    const client = this.openAIService.getClient();
    const model =
      this.configService.get<string>('openai.model') || 'gpt-3.5-turbo';

    const messages = [...(body.messages || [])];
    messages.push({ role: 'user', content: body.message });

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })) as Array<{
          role: 'user' | 'assistant' | 'system';
          content: string;
        }>,
        stream: true,
        stream_options: { include_usage: true },
      });

      let full = '';
      let usage: UsageDto = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          sink.onDelta(delta);
        }
        if (chunk.usage) {
          usage = this.mapUsage(chunk.usage);
        }
      }

      sink.onFinish({ message: full, usage });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Plain chat stream failed', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Chat stream failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async buildRagContext(body: RagChatRequestDto): Promise<RagContext> {
    if (this.vectorStore.getCount() === 0) {
      throw new HttpException(
        'No indexed chunks yet. Ingest documents and call POST /ingestion/documents/:id/process first.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const topK = body.topK ?? 5;
    const minScore = body.minScore ?? 0;

    const queryEmbedding = await this.embeddingService.embedQuery(body.message);

    const searchResults = this.vectorStore.search(
      queryEmbedding,
      topK,
      minScore,
      body.documentIds,
    );

    const prior = (body.messages || []).filter((m) => m.role !== 'system');

    const completionMessages = this.promptBuilder.buildRagMessages(
      body.message,
      searchResults,
      prior,
    );

    const model =
      this.configService.get<string>('openai.model') || 'gpt-3.5-turbo';

    return { searchResults, completionMessages, model };
  }

  private mapUsage(
    u:
      | {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        }
      | undefined,
  ): UsageDto {
    if (!u) {
      return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    }
    return {
      prompt_tokens: u.prompt_tokens,
      completion_tokens: u.completion_tokens,
      total_tokens: u.total_tokens,
    };
  }

  private toSources(results: SearchResult[]): RagSourceDto[] {
    return results.map((r) => ({
      chunkId: r.chunk.id,
      documentId: r.chunk.documentId,
      score: r.score,
      title: r.chunk.metadata?.title,
      source: r.chunk.metadata?.source,
      excerpt: excerpt(r.chunk.text, EXCERPT_LEN),
    }));
  }
}

function excerpt(text: string, maxLen: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= maxLen) {
    return t;
  }
  return `${t.slice(0, maxLen)}...`;
}
