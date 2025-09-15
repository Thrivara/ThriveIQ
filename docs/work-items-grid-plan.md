# ThriveIQ Work Items Grid — Detailed Implementation Plan

This document describes the end‑to‑end plan to build a rich Work Items experience (Azure DevOps/Jira‑like grid) with filtering, sorting, pagination, wildcard search, direct links to source systems, AI generation (single/bulk), progress tracking, and commit/apply flow. It builds on the current Next.js + Supabase architecture and the existing schema (workspaces, projects, integrations, secrets, runs, run_items, contexts, templates).

## 1) Goals & Scope
- Single page to browse work items from connected sources (Azure DevOps now, Jira next)
- Powerful grid: filter, sort, paginate, keyword search, multi‑select
- Open source item in the native tool (ADO/Jira) via direct link
- Detailed Drawer for an item: fields, history, templates picker, contexts picker, “Generate with AI”
- Bulk AI generation for selected items; background processing with progress + notification
- Results preview: show before/after diffs and commit back to source (selectively)

## 2) UX Breakdown
- Toolbar
  - Keyword search (wildcard, e.g., contains)
  - Filters: Type, State, Assigned To, Tags, Area/Iteration (ADO), Project (for Jira), Source (ado|jira)
  - Sort dropdown: by ChangedDate (default desc), Title, State, Type, AssignedTo
  - Page size selector (25/50/100), pagination controls
- Grid (virtualized)
  - Columns: ID, Title, Description (preview), State, Type, Assigned To, Changed, Source, Link
  - Row selection (checkbox), sticky header
  - Row link icon opens ADO/Jira in new tab
  - Click row → opens Detail Drawer
- Detail Drawer
  - Fields (read‑only to start), markdown viewer for descriptions/AC
  - Templates select (from project.templates)
  - Context selector (from project.contexts)
  - Actions: Generate (single), View Results, Apply Changes
- Results Panel (side tab or bottom split)
  - Before/After diff for title/description/AC/custom fields
  - Selective apply per field
- Bulk Actions
  - Generate for selected items
  - Progress bar per run; toast + in‑page queue, badge in header

## 3) Data & Schema
Reuse existing schema:
- runs (status: pending|running|completed|failed, provider, model, contextRefs)
- run_items (status: pending|generated|applied|rejected, beforeJson, afterJson, sourceItemId)
- contexts, templates (already exist)
No schema changes required for MVP. Optional: add indices for faster queries in Supabase (contexts.project_id, templates.project_id).

## 4) API Design (Next Route Handlers)
All endpoints are under `/api/projects/:projectId` and respect Supabase Auth cookies.

- GET `/work-items`
  - Query params: `page`, `pageSize`, `q` (keyword), `sortBy`, `sortDir`, `type[]`, `state[]`, `assignedTo[]`, `tags[]`, `source` (ado|jira)
  - Behavior:
    - Determine active integration for project; for ADO → WIQL; for Jira → JQL
    - Translate filters/sort into WIQL/JQL
    - Return `{ items, page, pageSize, total }`
    - Each item includes `{ id, key (jira), title, state, type, assignedTo, changedDate, descriptionPreview, source, links: { html } }`

- GET `/work-items/:source/:itemId`
  - Fetch details: fields required for generation + diff (title, description, AC, etc.)

- POST `/work-items/generate`
  - Body: `{ itemIds: string[], templateId, contextIds: string[] }`
  - Creates a `run` (provider/model from UI settings), creates `run_items` with beforeJson (snapshot from source), sets status `pending`
  - Returns `{ runId }`

- GET `/runs/:runId`
  - Return `{ status, createdAt, completedAt, counts }` for progress

- GET `/runs/:runId/items`
  - Return generated results per item (afterJson) for preview

- POST `/runs/:runId/apply`
  - Body: `{ selectedItemIds: string[] }`
  - Applies back to ADO/Jira via REST (PATCH work items / transitions) and updates run_items.status to `applied`/`rejected`

Notes:
- For ADO, continue using headers: `Accept: application/json`, `X-TFS-FedAuthRedirect: Suppress`, Basic PAT auth
- For Jira (later), use PAT or OAuth with JQL and issue edit endpoints

## 5) Mapping: Filters/Sort → WIQL/JQL
- Keyword (q): ADO WIQL supports `CONTAINS` across fields (title/desc) via `ContainsWords` workaround; start with Title contains; later use Search REST API for richer search
- Type: map to `System.WorkItemType`
- State: `System.State`
- Assigned: `System.AssignedTo`
- Tags: ADO uses `System.Tags CONTAINS 'tag'`
- Sort: `ORDER BY [System.ChangedDate] DESC` or chosen field
- Pagination: WIQL returns IDs; page client‑side by slicing and fetching batches or use REST OData for skip/top (MVP: slice)

## 6) AI Generation Flow
- Inputs: selected item(s), chosen template, selected context files
- Prompt composition: template.body + variables + stitched context chunks
- Provider: OpenAI (configurable), model name; store in `runs`
- Process (MVP): server‑side background processing (setImmediate or queue), update run status and run_items
- Output Mapping: normalize afterJson to target format per source (ADO fields vs Jira fields)
- Safety: token/size guardrails; chunk context; retry/backoff on provider errors

## 7) Progress & Notifications
- Polling
  - Client polls `GET /runs/:runId` every 2–3s until completed/failed
- In‑page Queue
  - Header badge with number of active runs; list panel to view progress
- Toaster updates when completed
- Optional next: Supabase Realtime channel broadcasts per run

## 8) UI Plan (React)
- Grid
  - Use TanStack Table + React Virtual for performant large lists
  - Controlled state for filters/sort/pagination/search
  - Column visibility + resizing (later)
- Toolbar
  - Search input (debounced), multi‑select filters, sort dropdown, page size, pagination
  - “Generate” button enabled when ≥1 item selected
- Detail Drawer
  - Tabs: Details | Generate | Results
  - Generate: Template select, Context picker, Generate button (single)
  - Results: Before/After diff with apply toggle per field
- Bulk generation
  - Modal: pick Template + Contexts → confirm → POST `/work-items/generate`
  - Progress indicator links to Runs

## 9) Linking to Source
- For each row, compute `links.html`:
  - Azure DevOps: `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`
  - Jira: `https://{domain}/browse/{issueKey}`
- Open in new tab via link icon

## 10) Performance
- Cache: client `react-query` with stable keys per filter set
- Server caching: (later) short‑lived cache for WIQL/JQL responses per filter page
- Batch fetching: ADO `workitemsbatch` with requested fields

## 11) Security
- Secrets remain encrypted (AES‑256‑GCM)
- RLS policies in Supabase to ensure project isolation (follow‑up SQL policies)
- Server never returns PATs

## 12) Testing
- Unit: prompt composition, ADO client wrapper
- Integration: mock ADO responses for list/details/update
- UI: basic e2e for filtering/sorting and generation triggers

## 13) Rollout Plan
- Phase 1: List with filters/search/sort/paginate + detail drawer (read‑only) + open in source
- Phase 2: Single item AI generation + results preview + apply
- Phase 3: Bulk generation + run queue + notifications
- Phase 4: Saved views, column presets, Jira source parity

## 14) Step‑by‑Step Tasks
1) API: extend `/work-items` to accept filters/sort/pagination (ADO WIQL translate) and return `{ items, total }`
2) API: add `/work-items/:source/:itemId` for details (fields for AI)
3) UI: build Work Items Grid with TanStack Table, toolbar, selection, deep link to source
4) UI: Detail Drawer (Details tab)
5) API: `/work-items/generate` + run creation; server background processor (MVP: setImmediate loop)
6) UI: Generate (single) flow in drawer: template/context pickers, kick off generation, poll run
7) UI: Results tab with diff and Apply button
8) API: `/runs/:runId/items` + `/runs/:runId/apply`
9) UI: Bulk generate modal from grid selection; poll progress; header queue badge
10) Polish: empty states, error states, loading placeholders

## 15) Open Questions / Next Decisions
- Do we prefer SSE/Supabase Realtime for progress vs polling now?
- Saved views/user presets storage (table or JSON in user profile)?
- Jira authentication method (PAT vs OAuth) and domain config

---

This plan is implementation‑ready. Once approved, we’ll proceed with Phase 1 (list/grid + detail drawer) and deliver incremental PRs per phase.

