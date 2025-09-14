# Supabase MCP Server Setup

This project can integrate with the Supabase MCP server to expose your Supabase project to MCP-compatible clients (e.g., IDE agents).

## Prerequisites
- Supabase project URL and anon key (set in `.env` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`).
- Node.js 18+ environment on the machine running the MCP client.

## Configure environment
- Copy `.env.example` to `.env`
- Set:
  - `SUPABASE_URL=https://YOUR_PROJECT.supabase.co`
  - `SUPABASE_ANON_KEY=...`
  - Optionally, set `SUPABASE_SERVICE_ROLE_KEY` if your MCP tools need elevated access (be careful; treat as secret).

## Running the Supabase MCP server
- Install the Supabase MCP server package: `npm i -D @supabase/mcp-server-supabase`
- Set env vars:
  - `SUPABASE_PROJECT_REF=mlkhwlyhwukgkockjkty`
  - `SUPABASE_ACCESS_TOKEN=<your-personal-access-token>`
- Run: `npm run mcp:supabase`
- Configure your MCP client (VS Code Codex) to connect to the process as a local MCP server.

TOML config example for Codex (`~/.codex/config.toml`):

[mcpServers.supabase]
command = "npx"
args = ["-y", "@supabase/mcp-server-supabase", "--read-only", "--project-ref=mlkhwlyhwukgkockjkty"]

[mcpServers.supabase.env]
SUPABASE_ACCESS_TOKEN = "<your-personal-access-token>"

Notes
- The anon key respects your RLS policies; use the service role key only in trusted environments.
- This repo includes `server/supabase.ts` exposing a standard Supabase client for server-side usage if needed.
