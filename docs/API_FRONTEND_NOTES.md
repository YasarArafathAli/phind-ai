# API notes for frontend integration

**See also:** [Integration checklist](../../docs/INTEGRATION_CHECKLIST.md) — phased tasks to align the Next.js app with this API (contracts, OAuth, indexing).

Base URL defaults to **`http://localhost:3001`** (see `PORT` in `.env`). All JSON bodies use **`Content-Type: application/json`**.

Interactive schemas and “Try it out” are available at **`GET /api`** (Swagger UI).

A **frozen OpenAPI JSON** for codegen lives at **`openapi/openapi.json`** in this repo. Regenerate it with **`npm run openapi:export`** (from `ai-doc-chat-backend`). The Next.js app then runs **`npm run generate:api-types`** in **`phind-ai`** to refresh **`src/generated/openapi-types.ts`**. See [Phase 4 contracts](../../docs/PHASE_4_CONTRACTS.md).

A **Postman collection** lives at `postman/ai-doc-chat.postman_collection.json` (import it and set the `baseUrl`, `googleDocId`, and `canonicalDocumentId` variables).

CORS is enabled for browser clients (`main.ts`).

---

## Typical document Q&A flow

1. **Google OAuth (server-side tokens)**  
   `GET /ingestion/auth/url` → open `url` in a browser → user signs in → Google redirects to the **backend** at **`GET /ingestion/auth/callback?code=...`**. The API exchanges the code, then **HTTP 302 redirects** to the Next app at **`{FRONTEND_URL}/auth/callback?auth=success`** (or `?auth=error&reason=...`).  
   Set **`FRONTEND_URL`** in the Nest `.env` (e.g. `http://localhost:3000`) to match where the UI runs. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), the OAuth client’s **Authorized redirect URI** must be the **backend** callback (e.g. `http://localhost:3001/ingestion/auth/callback`), not the Next route.  
   Then `GET /ingestion/auth/status` should show `{ "authenticated": true }`. The API persists tokens to disk (default `data/google-oauth.json`) and reloads them on restart so users do not need to sign in again unless tokens are revoked or the file is deleted.

2. **List & ingest**  
   `GET /ingestion/documents/available` → pick IDs.  
   `POST /ingestion/documents/batch` with `{ "documentIds": ["..."] }` **or** `POST /ingestion/documents/:id/ingest` for one doc.

3. **Index for RAG (required before `/chat/rag`)**  
   `POST /ingestion/documents/:id/process` **or** `POST /ingestion/documents/process-all`.  
   Optional: `GET /ingestion/rag/stats` to confirm chunk counts.

4. **Ask with RAG**  
   `POST /chat/rag` with a `message`. Response includes **`sources`** (which chunks were used).

If the vector store is empty, **`POST /chat/rag`** returns **400** with a message telling you to run process first.

---

## Health

| Method | Path | Response (success) |
|--------|------|---------------------|
| GET | `/health` | At least `{ "status": "ok", "timestamp": "<ISO8601>" }` (may include extra fields from the health module) |
| GET | `/health/live` | `{ "status": "ok", "timestamp": "..." }` |
| GET | `/health/ready` | `{ "status": "ok" \| "degraded", "timestamp": "...", "checks": { ... } }` |
| GET | `/health/status` | Uptime, memory, document count, Google auth flag |

---

## Chat (no documents)

### `POST /chat`

Plain OpenAI chat (no retrieval from your ingested docs).

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `message` | string | yes | Latest user message |
| `messages` | array | no | Prior turns: `{ "role": "user" \| "assistant" \| "system", "content": string }[]` |

The server appends `message` as the latest user turn (same pattern as many chat UIs).

**Response `200`**

```json
{
  "message": "Assistant reply text",
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

---

## Chat (RAG, grounded on processed documents)

### `POST /chat/rag`

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `message` | string | yes | Question to answer |
| `messages` | array | no | Prior **user/assistant** turns only; `message` is the current question. `system` entries in `messages` are ignored for RAG. |
| `topK` | number (int) | no | Chunks to retrieve, **1–20**, default **5** |
| `minScore` | number | no | Minimum cosine similarity **0–1**, default **0** (stricter = fewer chunks) |
| `documentIds` | string[] | no | If set, search **only** chunks from these canonical document IDs (e.g. `google_docs_abc123`) |

**Minimal example**

```json
{
  "message": "What are the main action items?"
}
```

**With history and filters**

```json
{
  "message": "Summarize that in one sentence.",
  "messages": [
    { "role": "user", "content": "What are the deadlines?" },
    { "role": "assistant", "content": "The doc mentions Q2 for the release." }
  ],
  "topK": 5,
  "minScore": 0.2,
  "documentIds": ["google_docs_1a2b3c4d"]
}
```

**Response `200`**

```json
{
  "message": "Answer text grounded on retrieved passages.",
  "sources": [
    {
      "chunkId": "chunk_google_docs_1a2b3c4d_0",
      "documentId": "google_docs_1a2b3c4d",
      "score": 0.8123,
      "title": "My Doc Title",
      "source": "google_docs",
      "excerpt": "First ~280 characters of chunk text..."
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

- **`sources`**: one entry per retrieved chunk passed into the model (after `topK` / `minScore` / `documentIds`).  
- **`score`**: cosine similarity (higher = more similar to the question embedding).  
- **`excerpt`**: short preview for UI citations; not the full chunk.

**Response `400`**

- No indexed chunks yet (call `POST /ingestion/documents/:id/process` or `process-all` first).

**Response `500`**

- OpenAI or internal errors; `message` may contain details in development.

---

## Ingestion

### Auth

| Method | Path | Notes |
|--------|------|--------|
| GET | `/ingestion/auth/url` | Returns `{ "url": "<Google OAuth URL>" }` |
| GET | `/ingestion/auth/callback` | Google sends `?code=...` or `?error=...`. Nest exchanges the code, then **302 redirects** to `{FRONTEND_URL}/auth/callback?auth=success` or `?auth=error&reason=...` |
| GET | `/ingestion/auth/status` | `{ "authenticated": boolean }` |

### Documents

| Method | Path | Body / params |
|--------|------|----------------|
| GET | `/ingestion/documents/available` | Lists **native Google Docs** and **PDFs** in Drive (each row includes `mimeType`). Other file types are not listed. |
| POST | `/ingestion/documents/batch` | `{ "documentIds": ["<google file id>", ...] }` — response: `{ "success": string[], "failed": { "id": string, "error": string }[] }` (canonical ids in `success`). Validation errors return **400** with `{ "message": "...", "statusCode": 400 }`. |
| POST | `/ingestion/documents/:id/ingest` | `:id` = Google Doc **file** ID |
| GET | `/ingestion/documents` | List ingested docs (summary) |
| GET | `/ingestion/documents/:id` | `:id` = **canonical** id (e.g. `google_docs_<fileId>`) |

### Indexing for RAG

| Method | Path | Notes |
|--------|------|--------|
| POST | `/ingestion/documents/:id/process` | `:id` = **canonical** document id from `GET /ingestion/documents`. Calling again **replaces** prior chunks for that document in the vector store (no duplicates). |
| POST | `/ingestion/documents/process-all` | Processes every ingested document |
| GET | `/ingestion/rag/stats` | `{ "totalEmbeddings": number, "documentCount": number }` |

**Process single document success (example)**

```json
{
  "documentId": "google_docs_abc",
  "title": "Spec",
  "chunksCreated": 12,
  "embeddingsGenerated": 12,
  "success": true
}
```

---

## WebSocket (Socket.IO) — streaming chat (Phase 4)

Connect a **Socket.IO** client to the **same origin and port** as the REST API, e.g. `http://localhost:3001`. Path defaults to Socket.IO’s standard (`/socket.io`). CORS allows any origin for the handshake.

Use **`socket.io-client`** on the frontend:

```text
npm install socket.io-client
```

```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:3001', { transports: ['websocket', 'polling'] });
```

### Conversation IDs

- Omit **`conversationId`** on the first message: the server generates one and sends it in **`rag:started`** / **`chat:started`** (and again in **`rag:done`** / **`chat:done`**).
- Send that **`conversationId`** on later messages so the server can load **in-memory** prior turns (user + assistant). History is **lost on server restart**.

Optional **`messages`** on a request are **extra** prior turns for that request only (appended after stored history).

### RAG streaming — event `rag:stream` (client emits)

**Payload (JSON):**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `conversationId` | string | no | Thread id from a previous `rag:started` / `rag:done` |
| `message` | string | yes | Current user question |
| `messages` | array | no | Optional extra `{ role, content }[]` for this turn only |
| `topK`, `minScore`, `documentIds` | | no | Same meaning as `POST /chat/rag` |

**Server events (listen):**

| Event | Payload |
|-------|---------|
| `rag:started` | `{ conversationId }` |
| `rag:chunk` | `{ conversationId, delta }` — many times; append `delta` for the assistant reply |
| `rag:done` | `{ conversationId, message, sources, usage }` — same shape as REST `POST /chat/rag` |
| `rag:error` | `{ conversationId, code, message }` — e.g. **400** if vector store is empty |

### Plain chat streaming — event `chat:stream` (client emits)

No document retrieval; same OpenAI model as `POST /chat`.

**Payload:** `{ conversationId?, message, messages? }`

**Server events:** `chat:started`, `chat:chunk` `{ conversationId, delta }`, `chat:done` `{ conversationId, message, usage }`, `chat:error`.

### Clear history — event `history:clear` (client emits)

**Payload:** `{ conversationId }` (required)

**Server:** `history:cleared` `{ conversationId }` or `history:error` `{ code, message }`.

---

## Validation errors

The app uses a global validation pipe: unknown properties may be stripped; extra properties can cause **400** if configured strictly. Send only documented fields.

---

## Environment (backend)

Frontend does **not** send the OpenAI API key. The server reads **`OPENAI_API_KEY`** and optional model env vars. Google OAuth client config is also server-side.
