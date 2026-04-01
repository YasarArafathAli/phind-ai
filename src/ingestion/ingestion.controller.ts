import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleDocsConnector } from './google-docs.connector';
import { IngestionService } from './ingestion.service';
import { ProcessingService } from '../rag/processing.service';

// DTO for batch ingestion
interface IngestBatchDto {
  documentIds: string[];
}

/**
 * REST API for document ingestion
 */
@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly connector: GoogleDocsConnector,
    private readonly ingestionService: IngestionService,
    private readonly processingService: ProcessingService,
  ) {}

  /**
   * Get the Google OAuth URL for authorization
   * GET /ingestion/auth/url
   */
  @Get('auth/url')
  getAuthUrl() {
    return { url: this.connector.getAuthUrl() };
  }

  /**
   * OAuth callback - exchange code for tokens
   * GET /ingestion/auth/callback?code=xxx
   */
  @Get('auth/callback')
  async authCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const success = await this.connector.authenticate(code);
    if (success) {
      return res.json({ message: 'Authenticated successfully' });
    } else {
      return res.status(401).json({ error: 'Authentication failed' });
    }
  }

  /**
   * Check authentication status
   * GET /ingestion/auth/status
   */
  @Get('auth/status')
  getAuthStatus() {
    return { authenticated: this.connector.isAuthenticated() };
  }

  /**
   * List available documents from Google Drive
   * GET /ingestion/documents/available
   */
  @Get('documents/available')
  async listAvailable() {
    return this.connector.listDocuments();
  }

  /**
   * Ingest selected documents (user picks which ones)
   * POST /ingestion/documents/batch
   * Body: { documentIds: ["id1", "id2", ...] }
   */
  @Post('documents/batch')
  async ingestBatch(@Body() body: IngestBatchDto) {
    if (!body.documentIds || !Array.isArray(body.documentIds)) {
      return { error: 'documentIds array is required' };
    }

    if (body.documentIds.length === 0) {
      return { error: 'At least one document ID is required' };
    }

    return this.ingestionService.ingestBatch(body.documentIds);
  }

  /**
   * Ingest a single document
   * POST /ingestion/documents/:id/ingest
   */
  @Post('documents/:id/ingest')
  async ingestDocument(@Param('id') id: string) {
    const doc = await this.ingestionService.ingestDocument(id);
    return {
      id: doc.id,
      title: doc.title,
      blockCount: doc.contentBlocks.length,
    };
  }

  /**
   * Get all ingested documents
   * GET /ingestion/documents
   */
  @Get('documents')
  getDocuments() {
    const docs = this.ingestionService.getDocuments();
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      source: d.source,
      blockCount: d.contentBlocks.length,
      updatedAt: d.updatedAt,
    }));
  }

  /**
   * Get a single ingested document with full content
   * GET /ingestion/documents/:id
   */
  @Get('documents/:id')
  getDocument(@Param('id') id: string) {
    const doc = this.ingestionService.getDocument(id);
    if (!doc) {
      return { error: 'Document not found' };
    }
    return doc;
  }

  /**
   * Process a document for RAG: chunk, embed, and store in vector store
   * POST /ingestion/documents/:id/process
   */
  @Post('documents/:id/process')
  async processDocument(@Param('id') id: string) {
    const doc = this.ingestionService.getDocument(id);
    if (!doc) {
      return { error: 'Document not found' };
    }

    try {
      const result = await this.processingService.processDocument(doc);
      return {
        documentId: doc.id,
        title: doc.title,
        chunksCreated: result.chunks.length,
        embeddingsGenerated: result.embeddedChunks.length,
        success: result.success,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to process document',
      };
    }
  }

  /**
   * Process all ingested documents for RAG
   * POST /ingestion/documents/process-all
   */
  @Post('documents/process-all')
  async processAllDocuments() {
    const documents = this.ingestionService.getDocuments();

    if (documents.length === 0) {
      return {
        message: 'No documents to process',
        processed: [],
        totalChunks: 0,
      };
    }

    try {
      const result = await this.processingService.processDocuments(documents);
      return {
        message: `Processed ${documents.length} documents`,
        processed: result.processed,
        totalChunks: result.totalChunks,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to process documents',
      };
    }
  }

  /**
   * Get RAG processing statistics
   * GET /ingestion/rag/stats
   */
  @Get('rag/stats')
  getRagStats() {
    return this.processingService.getStats();
  }
}
