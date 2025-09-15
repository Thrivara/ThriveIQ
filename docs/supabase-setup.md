# Supabase Migration Guide

This project uses Drizzle ORM with `pg` to connect to a Supabase Postgres database and Supabase Auth (JWT) for authentication.

## 1) Create Supabase project
- Create a new project at https://supabase.com
- Note the Postgres connection string (`DATABASE_URL`) and the project URL/keys (if adopting Supabase Auth later)

## 2) Configure environment
- Copy `.env.example` to `.env`
- Set `DATABASE_URL` to your Supabase Postgres connection string. Include `?sslmode=require`.
- Set `SESSION_SECRET` to a strong random value
 - Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for auth and tools

## 3) Generate SQL migrations (Drizzle → Supabase)
- Ensure dependencies are installed: `npm i`
- Generate SQL from the Drizzle schema: `npm run db:gen`
- Migrations are emitted to `supabase/migrations/` (configured in `drizzle.config.ts`).

## 4) Push schema via Supabase CLI
- Install and login: `brew install supabase/tap/supabase` then `supabase login`
- Ensure project is set in `supabase/config.toml` (`project_id = "mlkhwlyhwukgkockjkty"`).
- Push migrations to your cloud project: `supabase db push`

This applies the SQL in `supabase/migrations/` to your remote project.

## 5) Run locally
- `npm run dev` (Next dev)
- The app reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` for auth; DB access for API occurs server-side.

## 6) Next.js unified app on Vercel
- API is under `app/api/*` and the app root is this repo.
- Local dev: `npm run dev` (Next dev on port 3000 by default).
- Deploy to Vercel with this repo as the project root.

## 7) Auth
Auth is handled with Supabase SSR cookies (no Authorization header required). Login at `/login`.

## 8) Production hosting
- Deploy the Next app to Vercel (single project). Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel env.
