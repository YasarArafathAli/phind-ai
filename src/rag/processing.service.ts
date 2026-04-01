import { Injectable, Logger } from '@nestjs/common';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { CanonicalDocument } from '../ingestion/types';
import { DocumentChunk, EmbeddedChunk } from './types';

/**
 * ProcessingService orchestrates the RAG pipeline:
 * Document → Chunk → Embed → Store
 */
@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  /**
   * Process a document: chunk it, generate embeddings, and store in vector store
   */
  async processDocument(document: CanonicalDocument): Promise<{
    chunks: DocumentChunk[];
    embeddedChunks: EmbeddedChunk[];
    success: boolean;
  }> {
    this.logger.log(`Processing document: ${document.title} (${document.id})`);

    try {
      // Step 1: Chunk the document
      const chunks = this.chunkingService.chunkDocument(document);
      this.logger.log(`Created ${chunks.length} chunks`);

      if (chunks.length === 0) {
        this.logger.warn(`No chunks created for document: ${document.title}`);
        return {
          chunks: [],
          embeddedChunks: [],
          success: false,
        };
      }

      // Step 2: Generate embeddings for all chunks
      const embeddedChunks = await this.embeddingService.embedChunks(chunks);
      this.logger.log(`Generated ${embeddedChunks.length} embeddings`);

      // Step 3: Store in vector store
      this.vectorStore.addEmbeddings(embeddedChunks);
      this.logger.log(`Stored ${embeddedChunks.length} embeddings in vector store`);

      return {
        chunks,
        embeddedChunks,
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to process document ${document.id}:`, error);
      throw error;
    }
  }

  /**
   * Process multiple documents in sequence
   */
  async processDocuments(
    documents: CanonicalDocument[],
  ): Promise<{
    processed: Array<{ documentId: string; chunkCount: number; success: boolean }>;
    totalChunks: number;
  }> {
    this.logger.log(`Processing ${documents.length} documents`);

    const processed: Array<{
      documentId: string;
      chunkCount: number;
      success: boolean;
    }> = [];
    let totalChunks = 0;

    for (const document of documents) {
      try {
        const result = await this.processDocument(document);
        processed.push({
          documentId: document.id,
          chunkCount: result.chunks.length,
          success: result.success,
        });
        totalChunks += result.chunks.length;
      } catch (error) {
        this.logger.error(`Failed to process document ${document.id}:`, error);
        processed.push({
          documentId: document.id,
          chunkCount: 0,
          success: false,
        });
      }
    }

    this.logger.log(
      `Processed ${documents.length} documents, created ${totalChunks} total chunks`,
    );

    return {
      processed,
      totalChunks,
    };
  }

  /**
   * Remove a document from the vector store (e.g., when document is deleted)
   */
  removeDocument(documentId: string): void {
    this.logger.log(`Removing document ${documentId} from vector store`);
    this.vectorStore.removeDocument(documentId);
  }

  /**
   * Get statistics about the vector store
   */
  getStats(): {
    totalEmbeddings: number;
    documentCount: number;
  } {
    return {
      totalEmbeddings: this.vectorStore.getCount(),
      documentCount: 0, // TODO: Track document count if needed
    };
  }
}
