import { Injectable, Logger } from '@nestjs/common';
import { GoogleDocsConnector } from './google-docs.connector';
import { GoogleDocsNormalizer } from './google-docs.normalizer';
import { DocumentStore } from './document.store';
import { CanonicalDocument } from './types';

/**
 * IngestionService orchestrates the document ingestion pipeline:
 * 1. Fetch from source (via connector)
 * 2. Normalize to canonical format
 * 3. Save to store
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly connector: GoogleDocsConnector,
    private readonly normalizer: GoogleDocsNormalizer,
    private readonly store: DocumentStore,
  ) {}

  /**
   * Ingest a single document by ID
   */
  async ingestDocument(docId: string): Promise<CanonicalDocument> {
    this.logger.log(`Ingesting document: ${docId}`);

    // 1. Fetch from Google
    const rawDoc = await this.connector.fetchDocument(docId);

    // 2. Check if we already have this version
    if (this.store.hasVersion(docId, rawDoc.revisionId)) {
      this.logger.log(`Document ${docId} is already up to date`);
      const existing = this.store.get(`google_docs_${docId}`);
      if (existing) return existing;
    }

    // 3. Normalize to canonical format
    const canonical = this.normalizer.normalize(rawDoc);

    // 4. Save to store
    this.store.save(canonical);

    this.logger.log(
      `Ingested: ${canonical.title} (${canonical.contentBlocks.length} blocks)`,
    );
    return canonical;
  }

  /**
   * Ingest multiple documents selected by user
   */
  async ingestBatch(docIds: string[]): Promise<{
    success: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    this.logger.log(`Ingesting ${docIds.length} selected documents...`);

    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const docId of docIds) {
      try {
        const doc = await this.ingestDocument(docId);
        success.push(doc.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to ingest ${docId}: ${message}`);
        failed.push({ id: docId, error: message });
      }
    }

    this.logger.log(
      `Batch complete: ${success.length} ingested, ${failed.length} failed`,
    );
    return { success, failed };
  }

  /**
   * Get all ingested documents
   */
  getDocuments(): CanonicalDocument[] {
    return this.store.getAll();
  }

  /**
   * Get a single document by ID
   */
  getDocument(id: string): CanonicalDocument | undefined {
    return this.store.get(id);
  }
}
