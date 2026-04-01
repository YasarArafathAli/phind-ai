import { Injectable, Logger } from '@nestjs/common';
import { CanonicalDocument } from '../ingestion/types';
import { DocumentChunk, ChunkingConfig } from './types';

/**
 * ChunkingService splits documents into smaller chunks for embedding.
 * Uses a simple character-based approach with configurable size and overlap.
 */
@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  // Default chunking configuration
  private readonly defaultConfig: ChunkingConfig = {
    maxChunkSize: 1000, // Characters per chunk
    overlapSize: 200, // Overlap between chunks for context
    minChunkSize: 100, // Minimum chunk size
  };

  /**
   * Chunk a canonical document into smaller pieces
   */
  chunkDocument(
    document: CanonicalDocument,
    config?: Partial<ChunkingConfig>,
  ): DocumentChunk[] {
    const chunkConfig = { ...this.defaultConfig, ...config };
    const minChunkSize = chunkConfig.minChunkSize ?? 100;
    this.logger.log(
      `Chunking document: ${document.title} (${document.contentBlocks.length} blocks)`,
    );

    // Combine all content blocks into a single text with metadata
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';
    let currentChunkIndex = 0;
    let startBlockIndex = 0;
    let chunkStartBlockIndex = 0;

    for (let i = 0; i < document.contentBlocks.length; i++) {
      const block = document.contentBlocks[i];
      const blockText = block.text.trim();

      if (!blockText) continue; // Skip empty blocks

      // If adding this block would exceed max size, finalize current chunk
      if (
        currentChunk.length + blockText.length > chunkConfig.maxChunkSize &&
        currentChunk.length >= minChunkSize
      ) {
        // Save current chunk
        chunks.push(
          this.createChunk(
            document,
            currentChunk.trim(),
            currentChunkIndex++,
            chunkStartBlockIndex,
            startBlockIndex - 1,
          ),
        );

        // Start new chunk with overlap
        const overlap = this.getOverlap(
          currentChunk,
          chunkConfig.overlapSize,
        );
        currentChunk = overlap + blockText;
        chunkStartBlockIndex = startBlockIndex;
        startBlockIndex = i;
      } else {
        // Add block to current chunk
        if (currentChunk) {
          currentChunk += '\n\n' + blockText;
        } else {
          currentChunk = blockText;
          chunkStartBlockIndex = i;
        }
        startBlockIndex = i;
      }
    }

    // Add final chunk if there's remaining content
    if (currentChunk.trim().length >= minChunkSize) {
      chunks.push(
        this.createChunk(
          document,
          currentChunk.trim(),
          currentChunkIndex,
          chunkStartBlockIndex,
          document.contentBlocks.length - 1,
        ),
      );
    } else if (currentChunk.trim()) {
      // If final chunk is too small, merge with previous if possible
      if (chunks.length > 0) {
        chunks[chunks.length - 1].text += '\n\n' + currentChunk.trim();
        chunks[chunks.length - 1].endBlockIndex = document.contentBlocks.length - 1;
      } else {
        // If it's the only chunk, include it anyway
        chunks.push(
          this.createChunk(
            document,
            currentChunk.trim(),
            currentChunkIndex,
            chunkStartBlockIndex,
            document.contentBlocks.length - 1,
          ),
        );
      }
    }

    this.logger.log(
      `Created ${chunks.length} chunks from document: ${document.title}`,
    );
    return chunks;
  }

  /**
   * Create a DocumentChunk with proper metadata
   */
  private createChunk(
    document: CanonicalDocument,
    text: string,
    chunkIndex: number,
    startBlockIndex: number,
    endBlockIndex: number,
  ): DocumentChunk {
    return {
      id: `${document.id}_chunk_${chunkIndex}`,
      documentId: document.id,
      text,
      chunkIndex,
      startBlockIndex,
      endBlockIndex,
      metadata: {
        title: document.title,
        source: document.source,
        blockType: document.contentBlocks[startBlockIndex]?.type,
      },
    };
  }

  /**
   * Get overlap text from the end of current chunk
   */
  private getOverlap(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) {
      return text;
    }

    // Try to break at sentence boundary
    const overlapText = text.slice(-overlapSize);
    const sentenceEnd = overlapText.search(/[.!?]\s+/);

    if (sentenceEnd > overlapSize * 0.5) {
      // Found sentence boundary in reasonable position
      return overlapText.slice(sentenceEnd + 1);
    }

    // Fall back to word boundary
    const wordEnd = overlapText.search(/\s+/);
    if (wordEnd > overlapSize * 0.5) {
      return overlapText.slice(wordEnd);
    }

    // Just use the last N characters
    return overlapText;
  }
}
