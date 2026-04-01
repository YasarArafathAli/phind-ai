import { Module } from '@nestjs/common';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { ProcessingService } from './processing.service';
import { PromptBuilderService } from './prompt-builder.service';
import { OpenAIService } from '../common/openai/openai.service';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [VectorStoreModule],
  providers: [
    ChunkingService,
    EmbeddingService,
    ProcessingService,
    PromptBuilderService,
    OpenAIService,
  ],
  exports: [
    ChunkingService,
    EmbeddingService,
    ProcessingService,
    PromptBuilderService,
    OpenAIService,
  ],
})
export class RagModule {}
