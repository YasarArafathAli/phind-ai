/**
 * Types for RAG pipeline: chunks, embeddings, and vector storage
 */

// A chunk represents a piece of text from a document that can be embedded
export interface DocumentChunk {
  id: string; // Unique chunk ID
  documentId: string; // Reference to the source document
  text: string; // The actual text content
  chunkIndex: number; // Order within the document
  startBlockIndex?: number; // Which content block this chunk starts from
  endBlockIndex?: number; // Which content block this chunk ends at
  metadata?: {
    // Additional context about the chunk
    title?: string; // Document title
    source?: string; // Document source (google_docs, etc.)
    blockType?: string; // Type of content block (heading, paragraph, etc.)
  };
}

// An embedding with its associated chunk
export interface EmbeddedChunk {
  chunk: DocumentChunk;
  embedding: number[]; // Vector embedding (typically 1536 dimensions for OpenAI)
  embeddingModel: string; // Which model was used (e.g., "text-embedding-3-small")
}

// Search result from vector store
export interface SearchResult {
  chunk: DocumentChunk;
  embedding: number[];
  score: number; // Similarity score (0-1, higher is more similar)
}

// Configuration for chunking
export interface ChunkingConfig {
  maxChunkSize: number; // Maximum characters per chunk
  overlapSize: number; // Characters to overlap between chunks for context
  minChunkSize?: number; // Minimum characters per chunk (optional)
}
