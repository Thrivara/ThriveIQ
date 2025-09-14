import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const url = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set(name, value, options);
        } catch {
          // cookies() is read-only in some contexts (e.g., route handlers without a mutable response)
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        } catch {
          // ignore
        }
      },
    },
  });
}

