"use server";
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getServerClient() {
  const cookieStore = cookies();
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  if (!url || !anon) throw new Error('Missing Supabase env vars');
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set(name, value, options);
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set(name, '', { ...options, maxAge: 0 });
      },
    },
  });
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  if (!email) return { ok: false, error: 'Email required' } as const;

  const supabase = getServerClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) return { ok: false, error: error.message } as const;
  return { ok: true } as const;
}

export async function signOut() {
  const supabase = getServerClient();
  await supabase.auth.signOut();
  return { ok: true } as const;
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  if (!email || !password) return { ok: false, error: 'Email and password required' } as const;
  const supabase = getServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message } as const;
  return { ok: true, redirectTo: '/' } as const;
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  if (!email || !password) return { ok: false, error: 'Email and password required' } as const;
  const supabase = getServerClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message } as const;
  return { ok: true } as const;
}

export async function signInWithProvider(provider: 'google' | 'azure') {
  const supabase = getServerClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) return { ok: false, error: error.message } as const;
  return { ok: true, url: data?.url ?? null } as const;
}
