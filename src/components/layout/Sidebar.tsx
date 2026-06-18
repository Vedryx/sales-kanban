'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import { initialsOf } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const isBoard = pathname?.startsWith('/board');
  const isQueue = pathname?.startsWith('/queue');
  const name = session?.user?.name ?? session?.user?.email ?? 'User';
  const email = session?.user?.email ?? '';
  const initials = initialsOf(name);

  return (
    <aside
      className="
        flex shrink-0 border-b
        max-lg:h-14 max-lg:w-full max-lg:flex-row max-lg:items-center max-lg:gap-3 max-lg:px-4
        max-lg:pt-[env(safe-area-inset-top)]
        lg:h-full lg:w-[228px] lg:flex-col lg:border-r lg:border-b-0 lg:p-[20px_14px]
      "
      style={{ background: 'var(--color-bg2)', borderColor: 'var(--color-border)' }}
    >
      {/* Brand block */}
      <div
        className="
          flex items-center gap-3
          max-lg:px-0
          lg:px-2 lg:pb-6
        "
      >
        <div
          className="flex h-[30px] w-[30px] items-center justify-center rounded-md"
          style={{ background: 'linear-gradient(145deg,#e8a85c,#caa86b)' }}
        >
          <div className="h-[11px] w-[11px] rounded-sm" style={{ background: '#1b1715' }} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight">Vedryx</div>
          <div
            className="text-[11px] font-semibold tracking-wider max-lg:hidden"
            style={{ color: 'var(--color-text3)' }}
          >
            SALES
          </div>
        </div>
      </div>

      <nav
        className="
          flex
          max-lg:flex-row max-lg:gap-1
          lg:flex-col lg:gap-[3px]
        "
      >
        <NavItem href="/board" label="Pipeline" active={!!isBoard} />
        <NavItem href="/queue" label="Today's Queue" active={!!isQueue} />
      </nav>

      <div className="max-lg:ml-auto lg:mt-auto" ref={ref}>
        <div className="relative">
          {menuOpen && (
            <div
              className="
                absolute overflow-hidden rounded-xl border
                max-lg:top-full max-lg:right-0 max-lg:mt-2 max-lg:w-[220px]
                lg:right-0 lg:bottom-full lg:left-0 lg:mb-2
              "
              style={{
                background: 'var(--color-bg2)',
                borderColor: 'var(--color-border2)',
                boxShadow: '0 -10px 30px rgba(0,0,0,0.45)',
              }}
            >
              <div
                className="mono border-b px-4 py-3 text-[11px]"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text3)' }}
              >
                {email}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="w-full px-4 py-3 text-left text-[13px] hover:bg-[var(--color-surface)]"
                style={{ color: 'var(--color-red)' }}
              >
                Sign out
              </button>
            </div>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="
              flex w-full items-center gap-3 rounded-md
              max-lg:border-0 max-lg:px-1 max-lg:py-1 max-lg:min-h-[40px]
              lg:border-t lg:px-2 lg:py-3
              hover:bg-[var(--color-surface)]
            "
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold"
              style={{ background: 'var(--color-surface2)', color: 'var(--color-amber)' }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-left leading-tight max-sm:hidden">
              <div className="truncate text-[13px] font-semibold">{name}</div>
              <div
                className="truncate text-[11px] max-lg:hidden"
                style={{ color: 'var(--color-text3)' }}
              >
                SDR
              </div>
            </div>
            <span className="text-[11px]" style={{ color: 'var(--color-text3)' }}>
              ▾
            </span>
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: 'var(--color-green)', boxShadow: '0 0 6px var(--color-green)' }}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="
        flex items-center gap-3 rounded-md text-[13.5px] font-semibold
        max-lg:px-2.5 max-lg:py-1.5 max-lg:min-h-[36px]
        lg:px-3 lg:py-[9px]
      "
      style={{
        background: active ? 'var(--color-amber)' : 'transparent',
        color: active ? '#1b1715' : 'var(--color-text2)',
      }}
    >
      <div
        className="h-[13px] w-[13px] rounded-sm border-[1.6px] max-md:hidden"
        style={{ borderColor: 'currentColor', opacity: 0.85 }}
      />
      <span className="flex-1">{label}</span>
    </Link>
  );
}
