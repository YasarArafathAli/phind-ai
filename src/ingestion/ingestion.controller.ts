import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
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
@ApiTags('Ingestion')
@Controller('ingestion')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(
    private readonly connector: GoogleDocsConnector,
    private readonly ingestionService: IngestionService,
    private readonly processingService: ProcessingService,
    private readonly configService: ConfigService,
  ) {}

  /** Where the browser goes after OAuth; prefer process.env so it always matches deployment. */
  private getFrontendBase(): string {
    const fromEnv = process.env.FRONTEND_URL?.trim();
    const fromConfig = this.configService.get<string>('frontendUrl')?.trim();
    return (fromEnv || fromConfig || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
  }

  /**
   * Get the Google OAuth URL for authorization
   * GET /ingestion/auth/url
   */
  @Get('auth/url')
  getAuthUrl() {
    return { url: this.connector.getAuthUrl() };
  }

  /**
   * OAuth callback — Google redirects here with ?code=...
   * Exchanges the code for tokens, then redirects to the Next app (FRONTEND_URL + /auth/callback).
   * Google may also send ?error=...&error_description=... if the user cancels.
   */
  @Get('auth/callback')
  async authCallback(
    @Query('code') code: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    /** Must match the URI sent to Google on authorize (use when exchanging a code issued for the Next callback). */
    @Query('redirect_uri') redirectUriForToken: string | undefined,
    @Res() res: Response,
  ) {
    const base = this.getFrontendBase();
    const appCallback = `${base}/auth/callback`;

    try {
      if (oauthError) {
        const reason = encodeURIComponent(
          errorDescription?.trim() || oauthError,
        );
        this.logger.warn(`OAuth error from Google: ${oauthError}`);
        return res.redirect(302, `${appCallback}?auth=error&reason=${reason}`);
      }

      if (!code?.trim()) {
        return res.redirect(
          302,
          `${appCallback}?auth=error&reason=${encodeURIComponent('missing_code')}`,
        );
      }

      const ok = await this.connector.authenticate(
        code,
        redirectUriForToken?.trim() || undefined,
      );
      if (ok) {
        this.logger.log(`OAuth OK — redirect to ${appCallback}?auth=success`);
        return res.redirect(302, `${appCallback}?auth=success`);
      }
      this.logger.warn('OAuth token exchange failed');
      return res.redirect(
        302,
        `${appCallback}?auth=error&reason=${encodeURIComponent('token_exchange_failed')}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'callback_failed';
      this.logger.error(`OAuth callback error: ${msg}`, err);
      return res.redirect(
        302,
        `${appCallback}?auth=error&reason=${encodeURIComponent(msg)}`,
      );
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
   * Clear stored Google OAuth tokens so the user can disconnect or sign in with another account.
   * POST /ingestion/auth/disconnect
   */
  @Post('auth/disconnect')
  async disconnect() {
    await this.connector.disconnect();
    return { ok: true as const };
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
      throw new BadRequestException('documentIds array is required');
    }

    if (body.documentIds.length === 0) {
      throw new BadRequestException('At least one document ID is required');
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
      throw new NotFoundException('Document not found');
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
      throw new NotFoundException('Document not found');
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
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to process document',
      );
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
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to process documents',
      );
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
