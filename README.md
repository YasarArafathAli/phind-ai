# AI Document Chat Backend

A NestJS backend for a document intelligence platform that ingests documents from various sources (starting with Google Docs), normalizes them into a canonical format, and prepares them for AI processing (chunking, embeddings, RAG).

## Features

- Google Docs ingestion via OAuth 2.0
- User-controlled document selection
- Canonical document format (source-agnostic)
- Content block extraction (headings, paragraphs, lists, tables)
- Extensible connector architecture for future sources (Confluence, Notion, etc.)
- RAG query over indexed chunks (`POST /chat/rag` or Socket.IO `rag:stream`)
- **Socket.IO** streaming chat with in-memory conversation history (see `docs/API_FRONTEND_NOTES.md`)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
# Server
PORT=3001

# OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Google OAuth (for Google Docs ingestion)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/ingestion/auth/callback
```

### 3. Set up Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Docs API and Google Drive API
4. Go to Credentials > Create Credentials > OAuth client ID
5. Set application type to "Web application"
6. Add `http://localhost:3001/ingestion/auth/callback` as authorized redirect URI
7. Copy Client ID and Client Secret to your `.env` file

### 4. Run the server

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## API Endpoints

### Health Checks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/ready` | Kubernetes readiness probe |
| GET | `/health/status` | Detailed service status (memory, uptime, etc.) |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ingestion/auth/url` | Get Google OAuth authorization URL |
| GET | `/ingestion/auth/callback?code=xxx` | OAuth callback (exchanges code for tokens) |
| GET | `/ingestion/auth/status` | Check authentication status |

### Document Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ingestion/documents/available` | List documents from user's Google Drive |
| POST | `/ingestion/documents/batch` | Ingest selected documents |
| POST | `/ingestion/documents/:id/ingest` | Ingest a single document |
| GET | `/ingestion/documents` | List all ingested documents |
| GET | `/ingestion/documents/:id` | Get document with full content |
| POST | `/ingestion/documents/:id/process` | Chunk, embed, and index document for RAG |
| POST | `/ingestion/documents/process-all` | Index all ingested documents |
| GET | `/ingestion/rag/stats` | Vector store / indexing stats |

### Chat & RAG (REST)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat` | Plain OpenAI chat (no documents) |
| POST | `/chat/rag` | RAG answer with `sources` and `usage` |

### WebSocket (Socket.IO)

Connect a Socket.IO client to the **same URL/port** as the HTTP API (e.g. `http://localhost:3001`). Use events such as **`rag:stream`** and **`chat:stream`** for token-by-token streaming; the server assigns a **`conversationId`** for multi-turn history (in-memory). Full event payloads and examples: **[docs/API_FRONTEND_NOTES.md](./docs/API_FRONTEND_NOTES.md)**.

### Example: Ingest Selected Documents

```bash
# Request
POST /ingestion/documents/batch
Content-Type: application/json

{
  "documentIds": ["1abc123", "2def456"]
}

# Response
{
  "success": ["google_docs_1abc123", "google_docs_2def456"],
  "failed": []
}
```

## Project Structure

```
src/
├── main.ts                 # Application entry point
├── app.module.ts           # Root module
├── config/
│   └── env.config.ts       # Environment configuration
├── ingestion/              # Document ingestion pipeline
│   ├── types.ts            # All types (CanonicalDocument, ContentBlock, etc.)
│   ├── google-docs.connector.ts    # Google OAuth + API calls
│   ├── google-docs.normalizer.ts   # Converts to canonical format
│   ├── document.store.ts   # In-memory storage (swap for DB later)
│   ├── ingestion.service.ts        # Orchestrates the pipeline
│   ├── ingestion.controller.ts     # REST API
│   └── ingestion.module.ts # NestJS module
├── common/
│   └── openai/
│       └── openai.service.ts
└── ...
```

## Testing with Postman

Import the collection from `postman/ai-doc-chat.postman_collection.json`. REST only; WebSocket flows are documented in `docs/API_FRONTEND_NOTES.md`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## License

MIT
