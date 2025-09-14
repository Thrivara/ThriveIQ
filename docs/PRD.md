# Product Requirements Document (PRD)  
**Project:** ThriveIQ  
**Owner:** Thrivara Team  
**Status:** Draft v1.1  

---

## 1. Overview

**ThriveIQ** is an AI-powered backlog management platform that helps consulting and engineering teams generate, rewrite, and sync work items (Epics, Features, User Stories, Tasks, Test Cases) with full project context.  

The application integrates with Jira, Azure DevOps, Confluence, and SharePoint to provide seamless work item management and AI-enhanced content generation.  

**Key Capabilities:**  
- Upload and process context files (PDF, DOCX, Markdown, etc.)  
- Create and apply reusable templates for backlog generation  
- Generate or enhance work items using AI with RAG (Retrieval Augmented Generation)  
- Multi-tenant workspace management with role-based access control  
- Comprehensive audit logging of AI activity and user actions  

---

## 2. Goals

- Reduce manual backlog writing effort for consulting/engineering teams  
- Improve quality and consistency of backlog items via AI augmentation  
- Ensure smooth synchronization between ThriveIQ and external platforms (Jira, Azure DevOps, Confluence, SharePoint)  
- Provide a secure, multi-tenant environment with full traceability  

---

## 3. Non-Goals

- ThriveIQ will not replace Jira/Azure DevOps as the system of record  
- No offline (desktop) version is planned in v1.0  
- AI training/fine-tuning is out of scope (only inference + embeddings)  

---

## 4. User Preferences

- **Preferred communication style:** Simple, everyday language  

---

## 5. System Architecture

### 5.1 Frontend
- **Framework:** Next.js (App Router)  
- **UI:** shadcn/ui (Radix UI primitives + Tailwind CSS)  
- **State Management:** TanStack React Query  
- **Routing:** Next.js App Router (file-based routing)  
- **Styling:** Tailwind CSS with CSS variables for theming (light/dark mode)  
- **Forms:** React Hook Form  
- **Hosting:** Vercel (serverless deployment + CDN edge network)  

### 5.2 Backend (via Next.js API Routes)
- **Runtime:** Node.js (serverless on Vercel)  
- **API Design:** RESTful endpoints implemented as Next.js API routes  
- **Authentication:** Supabase Auth (JWT)  
- **Database ORM:** Drizzle ORM (Supabase PostgreSQL)  
- **File Handling:** Supabase Storage (document uploads + retrieval)  

### 5.3 Database Design
- Entities: Users, Workspaces, Projects, Templates, Context Files, Embeddings, AI Runs, Secrets  
- **Database:** Supabase PostgreSQL  
- **Schema Management:** Drizzle Kit migrations  
- **Multi-tenancy:** Row-level security (workspace-based data isolation)  

### 5.4 AI Integration
- **LLM Provider:** OpenAI (GPT-5 as default, with fallback)  
- **RAG:** Text embeddings + chunked context retrieval  
- **File Support:** PDF, DOCX, Markdown, others  

### 5.5 Security
- **Authentication:** Supabase Auth (JWT)  
- **Secrets:** Encrypted API key storage in Supabase  
- **Isolation:** Workspace-based data segregation with RLS  
- **Hosting Security:** Vercel environment secrets for runtime config  

### 5.6 Integration Layer
- **Jira:** REST API v3 + OAuth 2.0  
- **Azure DevOps:** REST API + OAuth/Service Principal  
- **Confluence:** Content ingestion  
- **SharePoint:** File access via Microsoft Graph API  
- **Architecture:** Modular integration services (serverless functions)  

---

## 6. External Dependencies

### 6.1 Core Infrastructure
- Supabase PostgreSQL (DB)  
- Supabase Auth (JWT-based authentication)  
- Supabase Storage (file uploads + context files)  
- Vercel (frontend hosting + API routes)  

### 6.2 AI Services
- OpenAI GPT models (generation + embeddings)  

### 6.3 Third-Party Integrations
- Atlassian Jira (work item sync)  
- Microsoft Azure DevOps (work item sync)  
- Confluence (context ingestion)  
- SharePoint (document retrieval)  

### 6.4 Development Tools
- Next.js (frontend + API routes)  
- Vite (development build tooling)  
- TypeScript (full-stack type safety)  
- Tailwind CSS (styling)  
- Drizzle Kit (migrations)  

### 6.5 UI Libraries
- Radix UI (accessible primitives)  
- shadcn/ui (component system)  
- Lucide React (icons)  
- TanStack React Query (server state management)  

### 6.6 Session & Security
- JWT bearer tokens (Supabase Auth)  
- Supabase RLS (row-level security for tenants)  
- Vercel secrets for deployment environment variables  

---

## 7. Success Criteria

- Backlog item generation reduces manual effort by **>40%**  
- Seamless two-way sync with Jira and Azure DevOps  
- AI-enhanced backlog content accepted by **80%+ of users without major edits**  
- Security validated via penetration testing & role-based access control  

---

## 8. Risks & Mitigations

- **Risk:** AI-generated backlog items may be inaccurate  
  - *Mitigation:* Context ingestion + templates + human-in-loop review  

- **Risk:** Integration API rate limits  
  - *Mitigation:* Implement caching, batching, and retries  

- **Risk:** Multi-tenant data leakage  
  - *Mitigation:* Strict row-level security + Supabase isolation + encrypted secrets  

---

## 9. Milestones (Draft)

1. **Supabase setup (DB, Auth, Storage)** (2 weeks)  
2. **Next.js frontend scaffolding + hosting on Vercel** (2 weeks)  
3. **Context upload + processing flow** (3 weeks)  
4. **AI generation with RAG** (4 weeks)  
5. **Jira + Azure DevOps integrations** (3 weeks)  
6. **Confluence + SharePoint integrations** (3 weeks)  
7. **RBAC + Audit logging** (2 weeks)  
8. **Beta Release**  

---
