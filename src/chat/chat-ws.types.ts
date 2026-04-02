import { ChatMessageDto } from '../common/dtos/chat.dto';

/** Client -> server: stream a RAG turn (document-grounded). */
export interface RagStreamPayload {
  /** Omit to start a new thread; server returns one in `rag:started` / `rag:done`. */
  conversationId?: string;
  message: string;
  /** Optional extra prior turns for this request only (appended after stored history). */
  messages?: ChatMessageDto[];
  topK?: number;
  minScore?: number;
  documentIds?: string[];
}

/** Client -> server: stream a plain OpenAI turn (no retrieval). */
export interface ChatStreamPayload {
  conversationId?: string;
  message: string;
  messages?: ChatMessageDto[];
}

export interface HistoryClearPayload {
  conversationId: string;
}
