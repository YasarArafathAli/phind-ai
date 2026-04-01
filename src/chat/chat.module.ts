import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RagModule } from '../rag/rag.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [RagModule, VectorStoreModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
