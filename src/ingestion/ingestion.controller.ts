import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleDocsConnector } from './google-docs.connector';
import { IngestionService } from './ingestion.service';

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
}
