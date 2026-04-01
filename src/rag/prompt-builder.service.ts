import { Injectable } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { SearchResult } from './types';

/** Max total characters of chunk text to include in the prompt (rough token budget guardrail) */
const MAX_CONTEXT_CHARS = 12_000;

@Injectable()
export class PromptBuilderService {
  private readonly systemPrompt =
    'You are a helpful assistant. Answer using only the context provided below, which comes from the user\'s documents. ' +
    'If the context does not contain enough information, say so clearly. Be concise and accurate.';

  /**
   * Builds chat completion messages: optional prior turns, then a user message that includes
   * retrieved chunks and the user's question.
   */
  buildRagMessages(
    question: string,
    searchResults: SearchResult[],
    priorMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): ChatCompletionMessageParam[] {
    const contextBlock = this.formatContext(searchResults);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    for (const m of priorMessages) {
      if (m.role === 'system') {
        continue;
      }
      messages.push({ role: m.role, content: m.content });
    }

    const userContent =
      searchResults.length === 0
        ? `No relevant passages were retrieved from the documents.\n\nQuestion: ${question}`
        : `${contextBlock}\n\nQuestion: ${question}`;

    messages.push({ role: 'user', content: userContent });

    return messages;
  }

  private formatContext(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'Context from documents:\n(none)';
    }

    const parts: string[] = ['Context from documents:\n'];
    let used = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const title = r.chunk.metadata?.title;
      const header = title
        ? `[${i + 1}] ${title} (similarity: ${r.score.toFixed(4)})`
        : `[${i + 1}] (similarity: ${r.score.toFixed(4)})`;
      const block = `${header}\n${r.chunk.text}`;
      if (used + block.length > MAX_CONTEXT_CHARS) {
        parts.push('\n[Additional matching passages omitted due to length limit.]');
        break;
      }
      parts.push(block);
      used += block.length + 2;
    }

    return parts.join('\n\n---\n\n');
  }
}
