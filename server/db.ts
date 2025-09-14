import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Point it to your Supabase Postgres connection string.",
  );
}

// Supabase requires SSL in production connections. Enable SSL unless localhost.
const dbUrl = new URL(process.env.DATABASE_URL);
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(dbUrl.hostname);
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
