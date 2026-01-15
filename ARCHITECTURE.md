# AI Document Chat (RAG) Application - Architecture Overview

## 1. Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Google Docs  │  │ Chat UI      │  │ Source References   │  │
│  │ Picker       │  │ Component    │  │ Component           │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
└─────────┼──────────────────┼────────────────────────────────────┘
          │                  │
          │ HTTP             │ WebSocket
          │                  │
┌─────────▼──────────────────▼────────────────────────────────────┐
│                    NESTJS BACKEND                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    API Layer                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │ Ingestion    │  │ Chat         │  │ WebSocket    │   │  │
│  │  │ Controller   │  │ Controller   │  │ Gateway      │   │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │  │
│  └─────────┼──────────────────┼──────────────────┼──────────┘  │
│            │                  │                  │              │
│  ┌─────────▼──────────────────▼──────────────────▼──────────┐  │
│  │                  Service Layer                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │ Ingestion    │  │ RAG          │  │ Chat         │   │  │
│  │  │ Service      │  │ Service      │  │ Service      │   │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │  │
│  └─────────┼──────────────────┼──────────────────┼──────────┘  │
│            │                  │                  │              │
│  ┌─────────▼────────────────────────────────────────────────┐  │
│  │              Document Ingestion Layer                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │ Connectors   │  │ Normalizers  │  │ Document     │   │  │
│  │  │ (GoogleDocs) │  │              │  │ Store        │   │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │  │
│  └─────────┼──────────────────┼──────────────────┼──────────┘  │
│            │                  │                  │              │
│  ┌─────────▼──────────────────▼──────────────────▼──────────┐  │
│  │              AI & Vector Store Layer                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │ OpenAI       │  │ Embedding    │  │ Vector       │   │  │
│  │  │ Service      │  │ Service      │  │ Store        │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Document Ingestion Pipeline

The ingestion pipeline fetches documents from external sources, normalizes them into a
canonical format, and stores them for downstream AI processing.

### Ingestion Flow (Google Docs)

```
1. User authenticates with Google OAuth
   │
   ▼
2. User selects documents to import
   │
   ▼
3. Connector fetches document from Google Docs API
   │
   ▼
4. Normalizer converts to CanonicalDocument format
   │  - Extracts headings, paragraphs, lists, tables
   │  - Strips Google-specific structures
   │  - Preserves document hierarchy
   │
   ▼
5. Document stored in DocumentStore
   │
   ▼
6. Ready for chunking/embedding (next phase)
```

### Canonical Document Model

All documents are normalized to this source-agnostic format:

```typescript
interface CanonicalDocument {
  id: string;              // "google_docs_abc123"
  source: string;          // "google_docs" | "confluence" | "notion"
  sourceId: string;        // Original ID in source system
  title: string;
  contentBlocks: ContentBlock[];
  author: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  metadata: Record<string, unknown>;
}

interface ContentBlock {
  blockId: string;
  type: "heading" | "paragraph" | "list" | "table";
  text: string;
  orderIndex: number;
  level?: number;          // For headings (1-6)
}
```

### Adding New Connectors

To add a new document source (e.g., Confluence):

1. Create `confluence.connector.ts` - handles API calls
2. Create `confluence.normalizer.ts` - converts to CanonicalDocument
3. Register in `ingestion.module.ts`

The AI layer only works with CanonicalDocument, so it remains source-agnostic.

## 3. RAG Data Flow

### Document Processing (CanonicalDocument → Vectors)

```
1. CanonicalDocument from ingestion
   │
   ▼
2. Chunking Service splits contentBlocks
   │
   ▼
3. For each chunk:
   │
   ├─► Generate embedding (OpenAI)
   │
   ├─► Store vector in Vector Store
   │
   └─► Store metadata in DB
   │
   ▼
4. Document ready for querying
```

### Query Flow (Question → Answer)

```
1. User asks question via WebSocket
   │
   ▼
2. Chat Controller receives query
   │
   ▼
3. Generate query embedding (OpenAI)
   │
   ▼
4. FAISS similarity search (top-k chunks)
   │
   ▼
5. Retrieve chunk metadata from DB
   │
   ▼
6. Build RAG prompt:
   │
   ├─► System prompt (instructions)
   │
   ├─► Context: Retrieved chunks
   │
   └─► User question
   │
   ▼
7. Stream OpenAI response (WebSocket)
   │
   ├─► Send tokens as they arrive
   │
   ├─► Track token usage
   │
   └─► Include source references
   │
   ▼
8. Return complete response with sources
```

## 4. Backend Folder Structure

**Principle: Start simple, add complexity only when needed**

```
src/
├── main.ts                          # Application entry point
├── app.module.ts                    # Root module
│
├── config/                          # Configuration
│   ├── env.config.ts               # Environment variables
│   └── openai.config.ts            # OpenAI client factory
│
├── ingestion/                       # Document ingestion pipeline
│   ├── types.ts                    # All types (CanonicalDocument, etc.)
│   ├── google-docs.connector.ts    # Google OAuth + API calls
│   ├── google-docs.normalizer.ts   # Converts to canonical format
│   ├── document.store.ts           # In-memory storage
│   ├── ingestion.service.ts        # Orchestrates: fetch → normalize → store
│   ├── ingestion.controller.ts     # REST API endpoints
│   └── ingestion.module.ts         # NestJS module
│
├── common/                          # Shared code
│   ├── dtos/                       # Data Transfer Objects
│   │   └── chat.dto.ts
│   └── openai/
│       └── openai.service.ts
│
├── chat/                            # Chat functionality (future)
│   ├── chat.module.ts
│   ├── chat.gateway.ts             # WebSocket for streaming
│   └── chat.service.ts             # RAG: query → embed → search → respond
│
├── rag/                             # RAG utilities (future)
│   ├── rag.module.ts
│   ├── chunking.service.ts         # Splits text into chunks
│   └── prompt-builder.service.ts   # Builds RAG prompts
│
├── vector-store/                    # Vector storage (future)
│   ├── vector-store.module.ts
│   └── vector-store.service.ts
│
└── utils/
    └── text.utils.ts               # Text cleaning, etc.
```

### Ingestion Module Details

```
ingestion/
├── types.ts                 # CanonicalDocument, ContentBlock, SyncState
├── google-docs.connector.ts # OAuth flow, Google API calls
├── google-docs.normalizer.ts# Extracts blocks from Google Docs structure
├── document.store.ts        # In-memory store (swap for DB later)
├── ingestion.service.ts     # Orchestrates the pipeline
├── ingestion.controller.ts  # REST endpoints
└── ingestion.module.ts      # Wires everything together
```

**Design Decisions:**
- All types in one file (`types.ts`) - easy to find and modify
- Connector handles ONLY API communication - no business logic
- Normalizer handles ONLY format conversion - no API calls
- Store is abstracted - easy to swap for database later
- Service orchestrates - single place to understand the flow

## 5. Technology Choices Justification

### Backend Framework: NestJS
**Why:**
- **Modular Architecture**: Built-in module system aligns perfectly with our feature-based structure
- **Dependency Injection**: Makes testing and swapping implementations easy (e.g., switching from FAISS to Pinecone later)
- **TypeScript First**: Type safety reduces bugs in complex AI pipelines
- **Enterprise Patterns**: Follows SOLID principles, making code maintainable and interview-ready
- **WebSocket Support**: Built-in `@nestjs/websockets` for real-time streaming
- **Validation**: Built-in class-validator for DTO validation

**Trade-offs:**
- Slightly more boilerplate than Express, but worth it for maintainability
- Learning curve if new to decorators, but standard in modern Node.js

### Vector Store: FAISS (Local)
**Why:**
- **Local-First**: No external dependencies, perfect for Phase 1
- **Fast**: Facebook's optimized C++ library, very fast similarity search
- **Free**: No API costs during development
- **Privacy**: Data never leaves your machine
- **Learning**: Understanding vector storage fundamentals is valuable

**Trade-offs:**
- **Single Machine**: Won't scale horizontally (but we'll design interfaces to swap later)
- **Memory**: Loads entire index in RAM (fine for <100k chunks)
- **Migration Path**: We'll create an abstraction layer, so switching to Pinecone/Weaviate later is easy

### Database: SQLite → Postgres
**Why Start with SQLite:**
- **Zero Setup**: No installation, works out of the box
- **Perfect for Phase 1**: Single-user, local-first
- **Fast Development**: No connection strings, migrations are simple

**Why Migrate to Postgres Later:**
- **Concurrent Access**: Better for multi-user (Phase 8)
- **Advanced Features**: Full-text search, JSON queries
- **Production Ready**: Industry standard

**Our Approach:**
- Use TypeORM with SQLite initially
- Database layer is abstracted, migration is straightforward

### AI Provider: OpenAI
**Why:**
- **Best Embeddings**: `text-embedding-3-small` is state-of-the-art and cheap
- **Reliable API**: Most stable and well-documented
- **Streaming**: Excellent streaming support for real-time UX
- **Token Tracking**: Built-in usage tracking for cost management

**Trade-offs:**
- **Cost**: ~$0.0001 per 1K tokens (embeddings), ~$0.002 per 1K tokens (chat)
- **Vendor Lock-in**: But we'll abstract the service layer
- **Rate Limits**: Need to handle gracefully

### File Parsing: PDF.js or pdf-parse
**Why:**
- **PDF.js**: Browser-based, can run in Node.js with jsdom
- **pdf-parse**: Simpler, pure Node.js, good for basic PDFs
- **Start Simple**: Use pdf-parse, upgrade if needed

**Trade-offs:**
- **Complex PDFs**: May struggle with images, tables (Phase 2 enhancement)
- **Memory**: Large PDFs can be memory-intensive (we'll stream process)

### Streaming: WebSockets vs SSE
**Why WebSockets:**
- **Bidirectional**: Can handle user interruptions, cancellation
- **Lower Latency**: Persistent connection, no HTTP overhead per message
- **Better UX**: Real-time typing effect feels more natural
- **NestJS Native**: Built-in support

**Trade-offs:**
- **Complexity**: Slightly more complex than SSE
- **Connection Management**: Need to handle reconnections
- **Alternative**: SSE is simpler but unidirectional (we'll explain both)

### Why This Stack is Resume-Worthy

1. **Modern Architecture**: Modular, scalable, follows industry best practices
2. **AI/ML Integration**: Demonstrates understanding of embeddings, vector search, RAG
3. **Real-Time Systems**: WebSocket streaming shows you can build interactive UIs
4. **Full-Stack**: End-to-end feature implementation
5. **Production Patterns**: Error handling, validation, logging, testing
6. **Cost Awareness**: Token tracking shows business acumen
7. **Extensibility**: Designed to evolve (local → cloud, single → multi-user)

## 6. Key Design Principles

### Separation of Concerns
- **Controllers**: Handle HTTP/WebSocket, validation, response formatting
- **Services**: Business logic, orchestration
- **Repositories**: Data access abstraction
- **Utils**: Pure functions, reusable logic

### Keep It Simple
- **Start with concrete implementations** - FAISS directly, OpenAI directly
- **Add abstractions later** - only when we need to swap implementations
- **One way to do things** - avoid multiple strategies/patterns initially

### Error Handling Strategy
- **Validation Errors**: 400 Bad Request (user input issues)
- **Not Found**: 404 (document not found)
- **AI API Errors**: 502 Bad Gateway (external service failure)
- **Internal Errors**: 500 (log details, return safe message)

### Performance Considerations
- **Async Processing**: Document ingestion can be async (queue later)
- **Chunking Strategy**: Balance between context size and retrieval accuracy
- **Caching**: Cache embeddings for same queries (Phase 7)
- **Streaming**: Don't wait for full response, stream tokens

## 7. Implementation Plan

### Phase 1: Document Ingestion [DONE]
- [x] Google Docs connector with OAuth 2.0
- [x] Document normalization to canonical format
- [x] Content block extraction (headings, paragraphs, lists, tables)
- [x] In-memory document store
- [x] REST API for ingestion
- [x] User-controlled document selection

### Phase 2: Chunking & Embeddings [NEXT]
- [ ] Chunk canonical documents into smaller pieces
- [ ] Generate embeddings via OpenAI
- [ ] Store in vector database

### Phase 3: RAG Query
- [ ] Query endpoint
- [ ] Similarity search for relevant chunks
- [ ] Build context-aware prompts
- [ ] Get AI response with sources

### Phase 4: Real-time Chat
- [ ] WebSocket gateway
- [ ] Streaming responses
- [ ] Chat history

### Phase 5: Additional Connectors
- [ ] Confluence connector
- [ ] Notion connector
- [ ] Local file upload

### Phase 6: Production Hardening
- [ ] Database persistence (replace in-memory store)
- [ ] Error handling & validation
- [ ] Rate limiting
- [ ] Token usage tracking
