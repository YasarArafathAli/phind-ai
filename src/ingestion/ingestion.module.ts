import { Module } from '@nestjs/common';
import { GoogleDocsConnector } from './google-docs.connector';
import { GoogleOAuthStorageService } from './google-oauth.storage';
import { GoogleDocsNormalizer } from './google-docs.normalizer';
import { DocumentStore } from './document.store';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [RagModule],
  controllers: [IngestionController],
  providers: [
    GoogleOAuthStorageService,
    GoogleDocsConnector,
    GoogleDocsNormalizer,
    DocumentStore,
    IngestionService,
  ],
  exports: [IngestionService, DocumentStore, GoogleDocsConnector],
})
export class IngestionModule {}
