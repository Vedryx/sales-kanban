'use client';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

// Toaster lives at the top of the app tree so any descendant (Board's
// inbound-reply poller, future surfaces) can fire toast() without
// re-mounting a provider. Dark theme + tight position matches the
// existing kanban surface vocabulary; no provider gymnastics required.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="top-right"
        theme="dark"
        richColors={false}
        closeButton
      />
    </SessionProvider>
  );
}
