# Project Overview Prompt for AI Assistants

Use this prompt to help AI assistants (like ChatGPT) understand the high-level architecture and current state of this project.

---

## Project Context

I'm building an **AI Document Chat Backend** - a RAG (Retrieval-Augmented Generation) application that allows users to:
1. Import documents from various sources (starting with Google Docs)
2. Chat with an AI assistant that can answer questions based on the imported documents
3. Get source references for AI responses

This is a **NestJS backend** that will eventually connect to a React frontend. We're following a phased implementation approach, starting simple and adding complexity as needed.

---

## What Has Been Built So Far

### 1. **Core Infrastructure** ✅
- **NestJS Application Setup**: TypeScript-based backend framework with modular architecture
- **Configuration Management**: Environment-based config using `@nestjs/config`
  - OpenAI API key and model configuration
  - Google OAuth credentials for document ingestion
- **OpenAI Service**: Centralized service for OpenAI API interactions
  - Client initialization with API key
  - Reusable across the application
- **Swagger/OpenAPI Documentation**: Complete API documentation at `/api` endpoint
  - All endpoints documented with request/response schemas
  - Interactive testing interface

### 2. **Document Ingestion Pipeline** ✅ (Phase 1 Complete)
This is the foundation that allows importing documents from external sources.

**Architecture:**
- **Connector Pattern**: Source-specific connectors (e.g., `GoogleDocsConnector`) handle API communication
- **Normalizer Pattern**: Converts source-specific formats to a canonical document structure
- **Document Store**: In-memory storage (designed to be swapped for database later)

**Key Components:**
- `ingestion/ingestion.controller.ts`: REST API endpoints for document ingestion
- `ingestion/ingestion.service.ts`: Orchestrates the ingestion pipeline
- `ingestion/google-docs.connector.ts`: Handles Google OAuth 2.0 and Google Docs API calls
- `ingestion/google-docs.normalizer.ts`: Converts Google Docs structure to canonical format
- `ingestion/document.store.ts`: In-memory document storage
- `ingestion/types.ts`: Type definitions for `CanonicalDocument` and `ContentBlock`

**Canonical Document Model:**
All documents are normalized to this format regardless of source:
```typescript
interface CanonicalDocument {
  id: string;              // "google_docs_abc123"
  source: string;          // "google_docs" | "confluence" | "notion"
  sourceId: string;        // Original ID in source system
  title: string;
  contentBlocks: ContentBlock[];  // Structured content (headings, paragraphs, lists, tables)
  author: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  metadata: Record<string, unknown>;
}
```

**Ingestion Flow:**
1. User authenticates with Google OAuth via `/ingestion/auth/url`
2. User selects documents to import
3. Connector fetches document from Google Docs API
4. Normalizer converts to `CanonicalDocument` format
5. Document stored in `DocumentStore`
6. Ready for chunking/embedding (next phase)

**API Endpoints:**
- `GET /ingestion/auth/url` - Get Google OAuth URL
- `GET /ingestion/auth/callback` - OAuth callback handler
- `GET /ingestion/auth/status` - Check authentication status
- `GET /ingestion/documents/available` - List available Google Docs
- `POST /ingestion/documents/batch` - Ingest multiple documents
- `POST /ingestion/documents/:id/ingest` - Ingest single document
- `GET /ingestion/documents` - List all ingested documents
- `GET /ingestion/documents/:id` - Get full document content

### 3. **Basic Chat Endpoint** ✅
- `POST /chat` - Direct OpenAI chat endpoint (non-RAG, basic implementation)
  - Accepts message and optional conversation history
  - Returns AI response with token usage information
  - Uses DTOs for validation and Swagger documentation
  - Proper error handling

### 4. **Health & Monitoring** ✅
- `GET /health` - Health check endpoint
- Separate `HealthModule` for health-related functionality

### 5. **Data Transfer Objects (DTOs)** ✅
- `common/dtos/chat.dto.ts`: Request/response DTOs for chat endpoints
  - `ChatRequestDto`, `ChatResponseDto`, `ChatMessageDto`, `UsageDto`, `HealthResponseDto`
- `common/dtos/document.dto.ts`: DTOs for document operations
- All DTOs include:
  - Swagger decorators for API documentation
  - Validation decorators (class-validator)
  - Type safety

### 6. **Project Structure** ✅
```
src/
├── main.ts                          # Entry point with Swagger setup
├── app.module.ts                    # Root module
├── app.controller.ts                # Basic chat endpoint
│
├── config/                          # Configuration
│   ├── env.config.ts               # Environment variables
│   └── openai.config.ts            # OpenAI client factory
│
├── ingestion/                       # Document ingestion (Phase 1 - DONE)
│   ├── types.ts                    # CanonicalDocument, ContentBlock types
│   ├── google-docs.connector.ts   # Google OAuth + API calls
│   ├── google-docs.normalizer.ts  # Converts to canonical format
│   ├── document.store.ts           # In-memory storage
│   ├── ingestion.service.ts        # Orchestrates pipeline
│   ├── ingestion.controller.ts    # REST API endpoints
│   └── ingestion.module.ts         # NestJS module
│
├── common/                          # Shared code
│   ├── dtos/                       # Data Transfer Objects
│   │   ├── chat.dto.ts
│   │   └── document.dto.ts
│   └── openai/
│       └── openai.service.ts       # OpenAI client service
│
├── health/                          # Health check module
│   ├── health.controller.ts
│   └── health.module.ts
│
├── chat/                            # Chat functionality (prepared for Phase 4)
│   ├── chat.module.ts
│   ├── chat.gateway.ts             # WebSocket for streaming (future)
│   └── chat.service.ts             # RAG service (future)
│
├── rag/                             # RAG utilities (prepared for Phase 2-3)
│   ├── rag.module.ts
│   ├── chunking.service.ts         # Text chunking (future)
│   └── prompt-builder.service.ts   # RAG prompt building (future)
│
├── vector-store/                    # Vector storage (prepared for Phase 2)
│   ├── vector-store.module.ts
│   └── vector-store.service.ts
│
└── utils/
    └── text.utils.ts               # Text utilities
```

---

## Technology Stack

- **Framework**: NestJS 11 (TypeScript)
- **AI Provider**: OpenAI API (for embeddings and chat completions)
- **Document Source**: Google Docs (via Google Drive API with OAuth 2.0)
- **API Documentation**: Swagger/OpenAPI (@nestjs/swagger)
- **Validation**: class-validator, class-transformer
- **Architecture**: Modular, dependency injection, separation of concerns

---

## Design Principles

1. **Separation of Concerns**: Controllers handle HTTP, Services handle business logic, Repositories handle data access
2. **Keep It Simple**: Start with concrete implementations, add abstractions only when needed
3. **Source Agnostic**: All AI processing works with `CanonicalDocument`, making it easy to add new sources
4. **Phased Development**: Build incrementally, test each phase before moving to next
5. **Type Safety**: Full TypeScript with proper typing throughout

---

## Current Phase Status

### ✅ Phase 1: Document Ingestion (COMPLETE)
- Google Docs connector with OAuth 2.0
- Document normalization to canonical format
- Content block extraction (headings, paragraphs, lists, tables)
- In-memory document store
- REST API for ingestion
- User-controlled document selection

### 🔄 Phase 2: Chunking & Embeddings (NEXT)
- Chunk canonical documents into smaller pieces
- Generate embeddings via OpenAI
- Store in vector database (FAISS planned)

### 📋 Phase 3: RAG Query (PLANNED)
- Query endpoint with similarity search
- Build context-aware prompts
- Get AI response with source references

### 📋 Phase 4: Real-time Chat (PLANNED)
- WebSocket gateway for streaming
- Chat history management
- Real-time token streaming

---

## Key Features Implemented

1. **Modular Architecture**: Clean separation with NestJS modules
2. **API Documentation**: Complete Swagger documentation at `/api`
3. **Type Safety**: Full TypeScript with DTOs and validation
4. **Error Handling**: Proper HTTP status codes and error messages
5. **OAuth Integration**: Google OAuth 2.0 for secure document access
6. **Document Normalization**: Source-agnostic canonical format
7. **Extensibility**: Easy to add new document sources (connector + normalizer pattern)

---

## What's Next

The next phase involves:
1. **Chunking Service**: Split documents into smaller chunks for embedding
2. **Embedding Generation**: Use OpenAI to create vector embeddings
3. **Vector Store**: Store embeddings in FAISS (local) for similarity search
4. **RAG Query Flow**: 
   - User question → Generate query embedding → Similarity search → Retrieve relevant chunks → Build context → Get AI response with sources

---

## Important Notes for AI Assistants

- This is a **backend-only** project (frontend will be separate)
- We're using **in-memory storage** for Phase 1 (will migrate to database later)
- The architecture is designed to be **extensible** - easy to add new document sources
- All AI processing works with the **canonical document format** - source-agnostic
- We follow **NestJS best practices** - dependency injection, modules, DTOs
- Code is **well-commented** and follows **SOLID principles**
- We prioritize **simplicity** over cleverness - code should be easy to understand

---

## How to Use This Information

When asking an AI assistant for help:
1. Share this overview to give context
2. Reference specific phases or components
3. Ask for implementation help on the next phase
4. Request code reviews or architecture suggestions
5. Get help debugging specific modules

This prompt gives a complete high-level understanding of the project architecture, current state, and future direction.
