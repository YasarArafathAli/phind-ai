/**
 * All types for the ingestion pipeline in one place.
 * Keep it simple - we can split later if needed.
 */

// Content block types
export type BlockType = 'heading' | 'paragraph' | 'list' | 'table';

export interface ContentBlock {
  blockId: string;
  type: BlockType;
  text: string;
  orderIndex: number;
  // Optional: heading level (1-6), only for headings
  level?: number;
}

// The canonical document - source-agnostic format
export interface CanonicalDocument {
  id: string;
  source: 'google_docs' | 'confluence' | 'notion';
  sourceId: string;
  title: string;
  contentBlocks: ContentBlock[];
  author: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  metadata: Record<string, unknown>;
}

// Sync state for tracking what we've already ingested
export interface SyncState {
  documentId: string;
  sourceId: string;
  lastSyncedAt: Date;
  version: string;
}

// OAuth credentials for Google
export interface GoogleCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}
