import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIService } from '../common/openai/openai.service';
import { DocumentChunk, EmbeddedChunk } from './types';

/**
 * EmbeddingService generates vector embeddings for text chunks using OpenAI
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly openAIService: OpenAIService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate embedding for a single chunk
   */
  async embedChunk(chunk: DocumentChunk): Promise<EmbeddedChunk> {
    const model =
      this.configService.get<string>('openai.embeddingModel') ||
      'text-embedding-3-small';

    this.logger.debug(`Generating embedding for chunk: ${chunk.id}`);

    try {
      const client = this.openAIService.getClient();
      const response = await client.embeddings.create({
        model,
        input: chunk.text,
      });

      const embedding = response.data[0].embedding;

      return {
        chunk,
        embedding,
        embeddingModel: model,
      };
    } catch (error) {
      this.logger.error(`Failed to generate embedding for chunk ${chunk.id}:`, error);
      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Generate embeddings for multiple chunks in batch
   * OpenAI API supports up to 2048 inputs per request, but we'll batch smaller for safety
   */
  async embedChunks(chunks: DocumentChunk[]): Promise<EmbeddedChunk[]> {
    const model =
      this.configService.get<string>('openai.embeddingModel') ||
      'text-embedding-3-small';

    this.logger.log(`Generating embeddings for ${chunks.length} chunks`);

    // Batch size for API calls (OpenAI allows up to 2048, but we use smaller batches for safety)
    const batchSize = 100;
    const embeddedChunks: EmbeddedChunk[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      this.logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);

      try {
        const client = this.openAIService.getClient();
        const response = await client.embeddings.create({
          model,
          input: batch.map((chunk) => chunk.text),
        });

        // Map responses back to chunks
        for (let j = 0; j < batch.length; j++) {
          embeddedChunks.push({
            chunk: batch[j],
            embedding: response.data[j].embedding,
            embeddingModel: model,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to generate embeddings for batch starting at index ${i}:`, error);
        // Continue with other batches, but log the error
        throw new Error(
          `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.logger.log(`Generated ${embeddedChunks.length} embeddings`);
    return embeddedChunks;
  }

  /**
   * Generate embedding for a query string (used during search)
   */
  async embedQuery(query: string): Promise<number[]> {
    const model =
      this.configService.get<string>('openai.embeddingModel') ||
      'text-embedding-3-small';

    this.logger.debug(`Generating query embedding`);

    try {
      const client = this.openAIService.getClient();
      const response = await client.embeddings.create({
        model,
        input: query,
      });

      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Failed to generate query embedding:`, error);
      throw new Error(
        `Failed to generate query embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
