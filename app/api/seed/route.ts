import { NextResponse } from 'next/server';
import { seedInitialData } from '@/../lib/db/seed';

export async function POST() {
  try {
    const result = await seedInitialData();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const message = e?.message || 'Seed failed';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

// Convenience for local dev: allow GET to also trigger seeding
export const GET = POST;

