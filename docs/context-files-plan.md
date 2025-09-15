# Context Files — End‑to‑End Plan (OpenAI‑backed)

This plan delivers an opinionated, production‑ready Context Files feature that uploads files to OpenAI, indexes them into per‑project vector stores, surfaces ingestion status in the UI, and uses the indexed data automatically during AI generation (via the latest OpenAI Responses API file_search tooling). It preserves strict workspace/project separation and maintains local metadata for governance.

## 1) Goals
- Let users upload PDFs, Office docs, Markdown, CSV, TXT and use them as generation context without manual chunking.
- Keep context strictly partitioned by project (and therefore by workspace).
- Track ingestion status, size, type, and provenance in our DB.
- Use OpenAI’s native vector stores and file search at generation time; avoid re‑implementing embeddings/search unless necessary.

## 2) Architecture Overview
- Storage of bytes: OpenAI Files (primary). Optional: Supabase Storage mirror (future) for backup/audits.
- Index: OpenAI Vector Stores (one per project) to avoid cross‑tenant mixing.
- Metadata: Supabase (contexts, plus vector_store id on project). We never expose OpenAI keys to the client.
- Orchestration: Next.js route handlers call OpenAI (server‑side), update DB status, and poll indexing progress.

## 3) Data Model Changes
- Table: `projects`
  - Add `openai_vector_store_id` (text, nullable) — the vector store that holds this project’s files.
- Table: `contexts` (existing)
  - Add columns:
    - `openai_file_id` (text)
    - `provider` (text, default 'openai')
    - `status` (text enum: 'uploading' | 'indexing' | 'ready' | 'failed' | 'deleted')
    - `chunk_count` (integer, nullable)
    - `last_error` (text, nullable)
- Table: `context_chunks` (existing) — optional for local RAG; keep as is but not required when using OpenAI file_search.

Migration intent: non‑breaking; generation keeps working with or without local chunks. New code prefers OpenAI vector stores when present.

## 4) API Surface (Next route handlers)
- POST `/api/projects/:projectId/contexts/upload`
  - Accepts multipart file. Steps:
    1) Ensure project has `openai_vector_store_id` (create one if missing; store it on project).
    2) Create DB row in `contexts` with status='uploading'.
    3) `files.create` in OpenAI with purpose 'assistants' (vector store ingestion) → get `openai_file_id`.
    4) `vector_stores.files.create` to attach file to the project’s vector store → returns file link.
    5) Set status='indexing'. Return context id.
- GET `/api/projects/:projectId/contexts` (existing)
  - Include extra fields: `status`, `openai_file_id`, `chunk_count`.
- GET `/api/projects/:projectId/contexts/:id/status`
  - Poll `vector_stores.files.retrieve` (or list) to check `status` and `chunking` stats; update DB accordingly.
- DELETE `/api/projects/:projectId/contexts/:id`
  - `vector_stores.files.delete` + `files.delete` in OpenAI; mark DB row status='deleted'.
- POST `/api/projects/:projectId/contexts/:id/reindex` (optional)
  - Re‑attach to vector store; set status='indexing'.

Notes:
- Status semantics map to OpenAI: in_progress → 'indexing', completed → 'ready', failed → 'failed'.
- For large uploads, return immediately with status='indexing' and show progress in UI.

## 5) Vector Store Strategy (Separation & Scale)
- 1 vector store per project: `openai_vector_store_id` on `projects`.
- Files attach only to that store, guaranteeing strict project separation.
- Workspaces are implicitly separated because projects belong to workspaces.
- Optional quota: add max files/size per project and surface usage in UI.

## 6) UI/UX
- Context Files page
  - Drag‑and‑drop + file picker; batch upload; show per‑file status badge (Uploading / Indexing / Ready / Failed).
  - Columns: Name, Type, Size, Status, Uploaded, Preview (if supported), Delete.
  - Empty state explains supported formats and that files are indexed for AI use.
- File Details drawer (optional)
  - Show OpenAI file id, vector store id, chunk stats, last error, reindex button.
- Generation integration
  - User picks template + contexts as before; but the generation uses the vector store(s) automatically.
  - If multiple contexts are selected: no need to pass text — pass the vector store id only; OpenAI file_search handles retrieval.

## 7) Generation Path (OpenAI)
Preferred: Responses API with file_search (latest tooling)
- Attach the project’s `openai_vector_store_id` as the retrieval source.
- Use `tools: [{ type: 'file_search' }]` and `attachments: [{ vector_store_id }]` (or top‑level `response.create` options per current docs) so the model automatically searches the indexed content.
- Keep `response_format: json_schema` for structured output.
- Preserve our field contract (title, descriptionText, acceptanceCriteria, testCases, tasks, storyPoints, tags, etc.).
Fallback: Chat Completions (current implementation)
- If vector store is missing, fall back to current flow; optionally include top few local chunk texts if available.

## 8) Security & Governance
- Keys live server‑side only; client never touches OpenAI directly.
- Per‑project vector stores prevent data cross‑contamination.
- Audit columns on `contexts` and a deletion endpoint ensure compliance.
- Optionally mirror files to Supabase Storage with object path: `/workspaces/:wsId/projects/:projectId/contexts/:contextId/:filename` for portability.

## 9) Error Handling & Observability
- Persist `last_error` on `contexts` when OpenAI returns failure; show tooltip in UI.
- Add a background polling job (on demand via GET status) to transition 'indexing' → 'ready'.
- In generation, if file_search returns no citations, include a subtle note in the Results debug JSON.

## 10) Limits & Formats
- Respect OpenAI file limits (size, formats). Reject or warn early (UI + server check) for > size limit, unsupported types.
- For PDFs/Docx too large: break into multiple files (optional future enhancement) or advise splitting.

## 11) Rollout Steps
1) DB migrations
   - projects.add `openai_vector_store_id`
   - contexts.add `openai_file_id`, `provider`, `status`, `chunk_count`, `last_error`
2) OpenAI utilities
   - `ensureVectorStore(projectId)` → returns id; creates if absent; stores on `projects`.
   - `uploadToVectorStore(file, vectorStoreId)` → returns file ids; handles status mapping.
   - `getVectorFileStatus(vectorStoreId, fileId)` → returns in_progress|completed|failed + stats.
3) API endpoints
   - Implement POST upload, GET list, GET status, DELETE, (optional) POST reindex.
4) UI Context Files
   - Show status chips and reindex/delete actions; poll indexing on 'indexing' files.
5) Generation switch
   - If `projects.openai_vector_store_id` present, call Responses API with file_search + json_schema and attach the vector store id for retrieval.
6) QA & guardrails
   - Test large PDFs, multiple files, delete/reindex paths, and generation with file_search.

## 12) Optional Enhancements
- Per‑file scoping at run time: allow selecting a subset of ready files to apply during generation (multiple attachments to file_search), or default to whole project store.
- Realtime ingestion progress via server-sent events / websocket (future).
- Content previews (first page OCR / first lines) in the UI.

---

This plan keeps ingestion simple (all compute on OpenAI), guarantees project isolation, and integrates directly into generation. We can implement it in small PRs: (1) migrations + utilities, (2) upload/list/delete/status endpoints, (3) UI for Context Files, (4) generation switch to Responses with file_search.

