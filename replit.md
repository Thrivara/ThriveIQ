# ThriveIQ

## Overview

ThriveIQ is an AI-powered backlog management platform that helps consulting and engineering teams generate, rewrite, and sync work items (Epics, Features, User Stories, Tasks, Test Cases) using AI with project context. The application integrates with Jira, Azure DevOps, Confluence, and SharePoint to provide seamless work item management and AI-enhanced content generation.

The system allows users to upload context files, create templates, select work items from integrated platforms, and use AI to generate or enhance backlog content. It features multi-tenant workspace management with role-based access control and comprehensive audit logging.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Next.js using Vite for development and building
- **UI Framework**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack React Query for server state management and caching
- **Routing**: Wouter for client-side routing with a simple, lightweight approach
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Form Handling**: React Hook Form for form state management

### Backend Architecture
- **Runtime**: Node.js with Express.js web framework
- **Database ORM**: Drizzle ORM with PostgreSQL (Supabase-compatible via `pg`)
- **Authentication**: Supabase Auth (JWT) via Authorization header
- **API Design**: RESTful API endpoints with Express.js routing

### Database Design
- **Primary Database**: PostgreSQL with the following key entities:
  - Users and workspace management (multi-tenant)
  - Projects and integrations
  - Templates for AI generation
  - Context files and chunked embeddings
  - AI generation runs and results
  - Encrypted secrets storage
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Multi-tenancy**: Row-level security through workspace-based data isolation

### AI Integration
- **LLM Provider**: OpenAI integration (configured for GPT-5 as the latest model)
- **Context Processing**: Text embedding generation and chunking for RAG (Retrieval Augmented Generation)
- **File Processing**: Support for multiple document formats (PDF, DOCX, Markdown, etc.)

### Security Architecture
- **Authentication**: Supabase Auth (JWT) with Authorization header
- **Secrets Management**: Encrypted storage of API keys and integration credentials
- **Multi-tenant Isolation**: Workspace-based data segregation

### Integration Layer
- **Jira Integration**: REST API v3 integration with OAuth 2.0 authentication
- **Azure DevOps**: REST API integration with OAuth/Service Principal support
- **File Upload**: Multer-based file handling with memory storage
- **External Services**: Modular service architecture for different integrations

## External Dependencies

### Core Infrastructure
- **Database**: Supabase PostgreSQL (or any managed Postgres)
- **Authentication**: Supabase Auth (JWT)
- **File Storage**: Local file system (configurable upload directory)

### AI Services
- **OpenAI**: GPT models for content generation and text embeddings
- **Model Support**: Configured for GPT-5.2 with fallback capabilities

### Third-party Integrations
- **Atlassian Jira**: Work item synchronization and management via REST API v3
- **Microsoft Azure DevOps**: Work item integration via REST API
- **Confluence**: Document retrieval and context ingestion
- **SharePoint**: Document access via Microsoft Graph API

### Development Tools
- **Vite**: Frontend build tool and development server
- **TypeScript**: Type safety across the entire application
- **ESBuild**: Backend bundling for production deployment
- **Tailwind CSS**: Utility-first CSS framework
- **Drizzle Kit**: Database schema management and migrations

### UI Component Libraries
- **Radix UI**: Accessible component primitives
- **shadcn/ui**: Pre-built component system
- **Lucide React**: Icon library
- **TanStack React Query**: Server state management

### Session and Security
- **JWT**: Bearer tokens verified via Supabase Auth
