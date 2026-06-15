// Wrap signin in its own layout to ensure NextAuth's SessionProvider isn't needed here.
import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
