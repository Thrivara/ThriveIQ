"use client";
import { useState, useTransition } from 'react';
import { signInWithEmail, signInWithPassword, signUpWithPassword, signInWithProvider } from '@/../app/actions/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Sign in to ThriveIQ</h1>

      <div style={{ display: 'grid', gap: 12 }}>
        <button
          onClick={() => startTransition(async () => {
            const res = await signInWithProvider('google');
            if (res.ok && res.url) window.location.href = res.url;
            else setStatus(res.error || 'Failed to start Google sign-in');
          })}
          style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd', background: 'white' }}
        >
          Continue with Google
        </button>
        <button
          onClick={() => startTransition(async () => {
            const res = await signInWithProvider('azure');
            if (res.ok && res.url) window.location.href = res.url;
            else setStatus(res.error || 'Failed to start Azure sign-in');
          })}
          style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd', background: 'white' }}
        >
          Continue with Azure AD
        </button>
      </div>

      <div style={{ margin: '16px 0', textAlign: 'center', color: '#6b7280' }}>or</div>

      {/* Email magic link */}
      <form
        action={async (formData) => {
          setStatus('Sending magic link...');
          const res = await signInWithEmail(formData);
          if (res.ok) setStatus('Check your email for a magic link.');
          else setStatus(res.error || 'Failed to send link');
        }}
        style={{ marginBottom: 16 }}
      >
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, marginBottom: 12 }}
          required
        />
        <button type="submit" style={{ width: '100%', padding: 12, borderRadius: 8, background: '#111827', color: 'white' }}>
          Send magic link
        </button>
      </form>

      {/* Email + Password */}
      <form>
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8 }}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, marginBottom: 12 }}
          required
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={{ flex: 1, padding: 12, borderRadius: 8, background: '#111827', color: 'white' }}
            formAction={async (formData) => {
              const res = await signInWithPassword(formData);
              if (res.ok) {
                setStatus('Signed in. Redirecting...');
                window.location.assign(res.redirectTo || '/');
              } else setStatus(res.error || 'Sign in failed');
            }}
          >
            Sign in
          </button>
          <button type="submit" style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd', background: 'white' }}
            formAction={async (formData) => {
              const res = await signUpWithPassword(formData);
              if (res.ok) setStatus('Account created. Check your email to confirm.'); else setStatus(res.error || 'Sign up failed');
            }}
          >
            Sign up
          </button>
        </div>
      </form>

      {status && <p style={{ marginTop: 12, color: '#374151' }}>{status}</p>}
    </div>
  );
}
