import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { provisionUser } from '@/../lib/auth/provision-user';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectParam = requestUrl.searchParams.get('redirect_to');
  const redirectPath = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;

  const response = NextResponse.redirect(new URL(redirectPath, request.url));

  const supabase = createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: '', ...options, maxAge: 0 });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('Failed to exchange auth code for session', error);
    return NextResponse.redirect(new URL('/login?error=magic_link', request.url));
  }

  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult?.user;
  if (user) {
    try {
      await provisionUser({ userId: user.id, email: user.email });
    } catch (provisionError) {
      console.error('Failed to provision user after magic link sign-in', provisionError);
    }
  }

  return response;
}
