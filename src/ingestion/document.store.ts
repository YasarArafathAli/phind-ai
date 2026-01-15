import { Injectable, Logger } from '@nestjs/common';
import { CanonicalDocument, SyncState } from './types';

/**
 * Simple in-memory document store.
 * Replace with a real database later.
 */
@Injectable()
export class DocumentStore {
  private readonly logger = new Logger(DocumentStore.name);

  // In-memory storage
  private documents: Map<string, CanonicalDocument> = new Map();
  private syncStates: Map<string, SyncState> = new Map();

  /**
   * Save a document
   */
  save(doc: CanonicalDocument): void {
    this.documents.set(doc.id, doc);

    // Update sync state
    this.syncStates.set(doc.id, {
      documentId: doc.id,
      sourceId: doc.sourceId,
      lastSyncedAt: new Date(),
      version: doc.version,
    });

    this.logger.log(`Saved document: ${doc.title} (${doc.id})`);
  }

  /**
   * Get a document by ID
   */
  get(id: string): CanonicalDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Get all documents
   */
  getAll(): CanonicalDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Check if we already have this version of a document
   */
  hasVersion(sourceId: string, version: string): boolean {
    const existing = Array.from(this.syncStates.values()).find(
      (s) => s.sourceId === sourceId,
    );
    return existing?.version === version;
  }

  /**
   * Get sync state for a source document
   */
  getSyncState(sourceId: string): SyncState | undefined {
    return Array.from(this.syncStates.values()).find(
      (s) => s.sourceId === sourceId,
    );
  }

  /**
   * Get count of stored documents
   */
  count(): number {
    return this.documents.size;
  }
}
