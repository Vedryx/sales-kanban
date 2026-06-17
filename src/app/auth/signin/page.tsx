'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 py-20"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-[380px] text-center">
        <div
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'linear-gradient(145deg,#e8a85c,#caa86b)' }}
        >
          <div className="h-5 w-5 rounded-sm" style={{ background: '#1b1715' }} />
        </div>
        <h1 className="mb-2 text-[22px] font-extrabold tracking-tight">Vedryx Sales Kanban</h1>
        <p className="mb-6 text-[13.5px] leading-relaxed" style={{ color: 'var(--color-text2)' }}>
          Sign in with the Google account you&apos;ll use to send calendar invites.
        </p>
        {error && (
          <div
            className="mb-3 rounded-md border px-3 py-2 text-[12px]"
            style={{
              background: 'var(--color-red-soft)',
              color: 'var(--color-red)',
              borderColor: 'var(--color-red)',
            }}
          >
            {error}
          </div>
        )}
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await signIn('google', { callbackUrl: '/' });
            } catch {
              setError('Sign-in failed. Allow pop-ups and try again.');
              setLoading(false);
            }
          }}
          className="flex w-full items-center justify-center gap-3 rounded-md py-3 text-[14px] font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-amber)', color: '#1b1715' }}
        >
          <span
            className="flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-white text-[11px] font-bold"
            style={{ color: '#1b1715' }}
          >
            G
          </span>
          {loading ? 'Redirecting to Google…' : 'Continue with Google'}
        </button>
        <div
          className="mt-5 rounded-md border px-3 py-3 text-left text-[11.5px] leading-relaxed"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text3)',
          }}
        >
          <b className="block text-[11px] tracking-wide uppercase" style={{ color: 'var(--color-text2)' }}>
            Why Google?
          </b>
          Vedryx needs Calendar + Profile scopes to create G-Meet invites on your behalf. We
          don&apos;t read your inbox.
        </div>
        <div className="mono mt-8 text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
          © Vedryx · sales-kanban
        </div>
      </div>
    </div>
  );
}
