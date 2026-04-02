# Step-by-Step Learning Guide

## Our Learning Philosophy

**Build → Understand → Refactor**

1. **Build it working first** - Get something that works, even if it's not perfect
2. **Understand why it works** - Read the code, trace the flow
3. **Refactor when needed** - Only add complexity when you hit a real problem

## Step 1: Understanding RAG (Before We Code)

### What is RAG?

RAG = Retrieval Augmented Generation

**Simple explanation:**
- Instead of asking AI "What's in my document?" (it doesn't know)
- We: 1) Find relevant parts of document, 2) Give those parts to AI, 3) Ask AI to answer using those parts

**The Flow:**
```
Your Question → Find Similar Text → Give Context to AI → Get Answer
```

### Why Chunking?

- Documents are too big to send to AI all at once
- We split into smaller pieces (chunks)
- When you ask a question, we find the most relevant chunks
- Only send those chunks to AI (saves tokens, better answers)

### Why Embeddings?

- Embeddings = numbers that represent meaning of text
- Similar text = similar numbers
- We can search by similarity (not exact word matching)
- Example: "car" and "automobile" have similar embeddings

## Step 2: The Simplest Possible Implementation

### Document Upload Flow (Simple Version)

```typescript
// 1. User uploads PDF
POST /documents/upload

// 2. Extract text from PDF
const text = await extractTextFromPDF(file);

// 3. Split into chunks (simple: every 500 characters)
const chunks = splitIntoChunks(text, 500);

// 4. For each chunk:
for (const chunk of chunks) {
  // Generate embedding
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunk.text
  });
  
  // Store in FAISS (with chunk ID)
  faiss.add(embedding.vector, chunk.id);
  
  // Save chunk to database
  await db.save({ id: chunk.id, text: chunk.text, docId: doc.id });
}
```

### Query Flow (Simple Version)

```typescript
// 1. User asks question
POST /chat
{ message: "What is the main topic?" }

// 2. Generate embedding for question
const queryEmbedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: question
});

// 3. Find similar chunks
const similarChunks = faiss.search(queryEmbedding.vector, topK: 3);

// 4. Get chunk text from database
const chunkTexts = await db.getChunks(similarChunks.ids);

// 5. Build prompt
const prompt = `
Context from documents:
${chunkTexts.join('\n\n')}

Question: ${question}

Answer based on the context above:
`;

// 6. Get AI response
const response = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: prompt }]
});

// 7. Return answer
return { answer: response.choices[0].message.content };
```

## Step 3: What We've Built (Progress Tracker)

### Phase 1: Foundation & Document Ingestion [COMPLETE]
- [x] Architecture overview
- [x] Folder structure (NestJS modular architecture)
- [x] Configuration management (env-based config)
- [x] OpenAI service integration
- [x] Swagger/OpenAPI documentation at `/api`
- [x] Google Docs connector with OAuth 2.0
- [x] Document normalization to canonical format
- [x] Content block extraction (headings, paragraphs, lists, tables)
- [x] In-memory document store

### Phase 2: Chunking & Embeddings [COMPLETE]
- [x] ChunkingService - splits documents into chunks (1000 chars, 200 overlap)
- [x] EmbeddingService - generates embeddings via OpenAI (text-embedding-3-small)
- [x] VectorStoreService - in-memory storage with cosine similarity search
- [x] ProcessingService - orchestrates chunk -> embed -> store pipeline
- [x] API: POST `/ingestion/documents/:id/process` - process single document
- [x] API: POST `/ingestion/documents/process-all` - process all documents
- [x] API: GET `/ingestion/rag/stats` - get vector store statistics

### Phase 3: RAG Query [COMPLETE]
- [x] PromptBuilderService - system prompt, formatted context from retrieved chunks, optional prior turns
- [x] ChatService - RAG flow (embed query -> search -> build messages -> chat completion)
- [x] API: POST `/chat/rag` - RAG chat (optional `topK`, `minScore`, `documentIds`, conversation `messages`)
- [x] Source references in responses (`chunkId`, `documentId`, `score`, `title`, `source`, `excerpt`)
- [x] ChatModule wired with `RagModule` and `VectorStoreModule`
- [x] Vector store search supports optional filter by `documentIds`

### Phase 4: Real-time Chat [COMPLETE]
- [x] `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`
- [x] `ChatGateway` — Socket.IO events `rag:stream`, `chat:stream`, `history:clear`
- [x] Streaming completions via OpenAI (`stream: true`, token deltas on `rag:chunk` / `chat:chunk`)
- [x] `ChatHistoryService` — in-memory per-`conversationId` history for WebSocket flows
- [x] Token usage on stream (`stream_options.include_usage`) on `rag:done` / `chat:done`

## Step 4: Common Questions (Before We Start)

### Q: Why not use a vector database like Pinecone?
**A:** FAISS is simpler for learning - no API keys, no external services, runs locally. We can switch later if needed.

### Q: Why chunk by character count? Isn't that naive?
**A:** Yes, but it works! We'll improve it later. Start simple, optimize when you see the problems.

### Q: What if I have a 100-page PDF?
**A:** It will work, but might be slow. We'll add progress tracking and async processing later.
 
### Q: How do I know if it's working?
**A:** After each step, we'll test it:
- Upload PDF → Check database has document
- Query → Check you get relevant chunks
- Answer → Check answer mentions your document content

## Step 5: Tools We're Using

### Installed
- NestJS 11 (TypeScript framework)
- OpenAI SDK (embeddings + chat completions)
- @nestjs/config (environment configuration)
- @nestjs/swagger (API documentation)
- class-validator, class-transformer (DTOs and validation)
- googleapis (Google Docs integration via OAuth 2.0)

### Currently Using
- In-memory vector store with cosine similarity (no external dependencies)
- In-memory document store (will migrate to database later)

### Installed (Phase 4)
- `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` — WebSocket streaming chat

### Optional (Future Enhancements)
- `faiss-node` - For FAISS-based vector search (if performance needed)
- `sqlite3` + `typeorm` - For persistent database storage
- `pdf-parse` - PDF text extraction (if adding PDF upload)

## Current Status

**Phases 1–4 are COMPLETE.**

- **Ingestion:** Google Docs OAuth, canonical documents, in-memory document store.
- **Indexing:** Chunking, embeddings, in-memory vector search (cosine similarity), process endpoints.
- **RAG query:** `POST /chat/rag` or Socket.IO `rag:stream` — answers grounded on chunks plus **sources**.
- **Streaming:** Socket.IO `rag:chunk` / `chat:chunk` token deltas; **conversation** history via `conversationId` (in-memory).

Prerequisite for RAG: run `POST /ingestion/documents/:id/process` (or `process-all`) before RAG endpoints or `rag:stream`.

## What's Next?

Possible enhancements: **persist** chat history (database), WebSocket **auth**, PDF upload, external vector DB. See Optional (Future Enhancements) above.
