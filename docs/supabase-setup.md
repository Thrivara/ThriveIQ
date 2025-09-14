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

## 3) Push schema
- Ensure dependencies are installed: `npm i`
- Push schema to Supabase: `npm run db:push`

This uses `drizzle.config.ts` and `shared/schema.ts` to create tables.

## 4) Run locally
- `npm run dev` (uses `tsx` to run the Express API)
- The API reads `DATABASE_URL` and connects via SSL automatically unless `localhost`

## 5) Next.js unified app on Vercel
- API is under `app/api/*` and the app root is this repo.
- Local dev: `npm run dev` (Next dev on port 3000 by default).
- Deploy to Vercel with this repo as the project root.

## 6) Auth
The API expects `Authorization: Bearer <access_token>` where the token is issued by Supabase Auth. The middleware validates the token via `supabase.auth.getUser(token)` and populates `req.user`.

## 7) Production hosting for API
- Deploy the Express server to a Node host (Render, Railway, Fly.io, Supabase Functions, etc.)
- Set `DATABASE_URL` and `SESSION_SECRET` in your host env
- Expose the API URL for the frontend
