import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIService } from '../common/openai/openai.service';
import { RagChatRequestDto, RagChatResponseDto, RagSourceDto } from '../common/dtos/chat.dto';
import { EmbeddingService } from '../rag/embedding.service';
import { PromptBuilderService } from '../rag/prompt-builder.service';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { SearchResult } from '../rag/types';

const EXCERPT_LEN = 280;

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

    const client = this.openAIService.getClient();
    const model = this.configService.get<string>('openai.model') || 'gpt-3.5-turbo';

    this.logger.log(
      `RAG chat: model=${model}, chunks=${searchResults.length}, priorTurns=${prior.length}`,
    );

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: completionMessages,
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw new HttpException('No response from OpenAI', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const usage = completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

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
