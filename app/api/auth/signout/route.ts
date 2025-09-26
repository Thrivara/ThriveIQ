import { NextResponse } from 'next/server';
import { signOut } from '@/../app/actions/auth';

export async function POST() {
  try {
    await signOut();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const message = error?.message ?? 'Unable to sign out';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
