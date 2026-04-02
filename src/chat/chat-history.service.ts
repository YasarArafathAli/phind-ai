import { Injectable } from '@nestjs/common';
import { ChatMessageDto } from '../common/dtos/chat.dto';

/** In-memory per-conversation history for WebSocket chat (not persisted across restarts). */
@Injectable()
export class ChatHistoryService {
  /** Max messages retained per conversation (user + assistant turns). */
  private readonly maxMessages = 80;

  private readonly store = new Map<string, ChatMessageDto[]>();

  get(conversationId: string): ChatMessageDto[] {
    return this.store.get(conversationId)
      ? [...(this.store.get(conversationId) as ChatMessageDto[])]
      : [];
  }

  /**
   * Append a user message and assistant reply after a completed exchange.
   */
  appendExchange(
    conversationId: string,
    userText: string,
    assistantText: string,
  ): void {
    const row: ChatMessageDto[] = [
      { role: 'user', content: userText },
      { role: 'assistant', content: assistantText },
    ];
    const prev = this.store.get(conversationId) ?? [];
    const next = [...prev, ...row];
    while (next.length > this.maxMessages) {
      next.shift();
    }
    this.store.set(conversationId, next);
  }

  clear(conversationId: string): void {
    this.store.delete(conversationId);
  }
}
