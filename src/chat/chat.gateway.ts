import { HttpException, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { ChatHistoryService } from './chat-history.service';
import { ChatService } from './chat.service';
import { RagChatRequestDto } from '../common/dtos/chat.dto';
import type {
  ChatStreamPayload,
  HistoryClearPayload,
  RagStreamPayload,
} from './chat-ws.types';

/**
 * Socket.IO gateway for streaming chat (plain OpenAI) and RAG.
 * Connect with a Socket.IO client to the same origin/port as the HTTP API.
 */
@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly history: ChatHistoryService,
  ) {}

  /**
   * Document-grounded streaming: emits `rag:started`, `rag:chunk` (many), then `rag:done`, or `rag:error`.
   */
  @SubscribeMessage('rag:stream')
  async handleRagStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RagStreamPayload,
  ): Promise<void> {
    if (!payload?.message?.trim()) {
      client.emit('rag:error', { code: 400, message: 'message is required' });
      return;
    }

    const conversationId = payload.conversationId ?? randomUUID();
    const priorFromStore = this.history.get(conversationId);
    const extra = payload.messages ?? [];
    const prior = [...priorFromStore, ...extra].filter(
      (m) => m.role !== 'system',
    );

    const body: RagChatRequestDto = {
      message: payload.message,
      messages: prior,
      topK: payload.topK,
      minScore: payload.minScore,
      documentIds: payload.documentIds,
    };

    client.emit('rag:started', { conversationId });

    try {
      await this.chatService.streamRagChat(body, {
        onDelta: (delta) => {
          client.emit('rag:chunk', { conversationId, delta });
        },
        onFinish: (result) => {
          this.history.appendExchange(
            conversationId,
            payload.message,
            result.message,
          );
          client.emit('rag:done', { conversationId, ...result });
        },
      });
    } catch (err) {
      this.logError('rag:stream', err);
      const { code, message } = this.toWsError(err);
      client.emit('rag:error', { conversationId, code, message });
    }
  }

  /**
   * Plain OpenAI streaming (no retrieval): `chat:started`, `chat:chunk`, `chat:done` or `chat:error`.
   */
  @SubscribeMessage('chat:stream')
  async handleChatStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatStreamPayload,
  ): Promise<void> {
    if (!payload?.message?.trim()) {
      client.emit('chat:error', { code: 400, message: 'message is required' });
      return;
    }

    const conversationId = payload.conversationId ?? randomUUID();
    const priorFromStore = this.history.get(conversationId);
    const extra = payload.messages ?? [];
    const prior = [...priorFromStore, ...extra].filter(
      (m) => m.role !== 'system',
    );

    client.emit('chat:started', { conversationId });

    try {
      await this.chatService.streamPlainChat(
        { message: payload.message, messages: prior },
        {
          onDelta: (delta) =>
            client.emit('chat:chunk', { conversationId, delta }),
          onFinish: (result) => {
            this.history.appendExchange(
              conversationId,
              payload.message,
              result.message,
            );
            client.emit('chat:done', {
              conversationId,
              message: result.message,
              usage: result.usage,
            });
          },
        },
      );
    } catch (err) {
      this.logError('chat:stream', err);
      const { code, message } = this.toWsError(err);
      client.emit('chat:error', { conversationId, code, message });
    }
  }

  /** Drop server-side history for a thread (in-memory only). */
  @SubscribeMessage('history:clear')
  handleHistoryClear(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: HistoryClearPayload,
  ): void {
    if (!payload?.conversationId) {
      client.emit('history:error', {
        code: 400,
        message: 'conversationId is required',
      });
      return;
    }
    this.history.clear(payload.conversationId);
    client.emit('history:cleared', { conversationId: payload.conversationId });
  }

  private toWsError(err: unknown): { code: number; message: string } {
    if (err instanceof HttpException) {
      return { code: err.getStatus(), message: err.message };
    }
    return {
      code: 500,
      message: err instanceof Error ? err.message : 'Internal error',
    };
  }

  private logError(context: string, err: unknown): void {
    if (err instanceof HttpException) {
      this.logger.warn(`${context}: ${err.message}`);
    } else {
      this.logger.error(`${context}`, err);
    }
  }
}
