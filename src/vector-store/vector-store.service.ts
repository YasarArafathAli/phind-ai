import { Injectable, Logger } from '@nestjs/common';
import { EmbeddedChunk, SearchResult } from '../rag/types';

/**
 * VectorStoreService stores and searches vector embeddings.
 * Currently uses in-memory storage with cosine similarity.
 * Can be upgraded to FAISS or other vector databases later.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  // In-memory storage: map of chunk ID to embedded chunk
  private embeddings: Map<string, EmbeddedChunk> = new Map();

  // Index by document ID for easy lookup
  private documentChunks: Map<string, string[]> = new Map();

  /**
   * Add embedded chunks to the vector store
   */
  addEmbeddings(embeddedChunks: EmbeddedChunk[]): void {
    this.logger.log(
      `Adding ${embeddedChunks.length} embeddings to vector store`,
    );

    for (const embeddedChunk of embeddedChunks) {
      // Store the embedding
      this.embeddings.set(embeddedChunk.chunk.id, embeddedChunk);

      // Index by document ID
      const chunkIds =
        this.documentChunks.get(embeddedChunk.chunk.documentId) || [];
      if (!chunkIds.includes(embeddedChunk.chunk.id)) {
        chunkIds.push(embeddedChunk.chunk.id);
        this.documentChunks.set(embeddedChunk.chunk.documentId, chunkIds);
      }
    }

    this.logger.log(
      `Vector store now contains ${this.embeddings.size} embeddings`,
    );
  }

  /**
   * Search for similar chunks using cosine similarity
   * @param queryEmbedding The embedding vector to search for
   * @param topK Number of results to return
   * @param minScore Minimum similarity score (0-1)
   * @returns Array of search results sorted by similarity (highest first)
   */
  search(
    queryEmbedding: number[],
    topK: number = 5,
    minScore: number = 0.0,
    /** When set, only chunks from these documents are considered */
    documentIds?: string[],
  ): SearchResult[] {
    const filter =
      documentIds && documentIds.length > 0 ? new Set(documentIds) : undefined;

    this.logger.debug(
      `Searching vector store with topK=${topK}, minScore=${minScore}, documentFilter=${filter ? filter.size : 'none'}`,
    );

    const results: SearchResult[] = [];

    // Calculate cosine similarity for all embeddings
    for (const embeddedChunk of this.embeddings.values()) {
      if (filter && !filter.has(embeddedChunk.chunk.documentId)) {
        continue;
      }

      const score = this.cosineSimilarity(
        queryEmbedding,
        embeddedChunk.embedding,
      );

      if (score >= minScore) {
        results.push({
          chunk: embeddedChunk.chunk,
          embedding: embeddedChunk.embedding,
          score,
        });
      }
    }

    // Sort by score (highest first) and return top K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    this.logger.log(
      `Found ${topResults.length} results (from ${results.length} candidates)`,
    );
    return topResults;
  }

  /**
   * Get all chunks for a specific document
   */
  getChunksByDocument(documentId: string): EmbeddedChunk[] {
    const chunkIds = this.documentChunks.get(documentId) || [];
    return chunkIds
      .map((id) => this.embeddings.get(id))
      .filter((chunk): chunk is EmbeddedChunk => chunk !== undefined);
  }

  /**
   * Remove all chunks for a specific document
   */
  removeDocument(documentId: string): void {
    const chunkIds = this.documentChunks.get(documentId) || [];
    this.logger.log(
      `Removing ${chunkIds.length} chunks for document: ${documentId}`,
    );

    for (const chunkId of chunkIds) {
      this.embeddings.delete(chunkId);
    }
    this.documentChunks.delete(documentId);
  }

  /**
   * Get total number of stored embeddings
   */
  getCount(): number {
    return this.embeddings.size;
  }

  /** Number of distinct documents that have at least one chunk in the store */
  getDocumentCount(): number {
    return this.documentChunks.size;
  }

  /**
   * Clear all embeddings (useful for testing or reset)
   */
  clear(): void {
    this.embeddings.clear();
    this.documentChunks.clear();
    this.logger.log('Vector store cleared');
  }

  /**
   * Calculate cosine similarity between two vectors
   * Returns a value between -1 and 1, where 1 is identical
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}
