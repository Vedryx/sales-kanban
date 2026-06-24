'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import {
  type BoardFilterState,
  type ScoreFlag,
  type PitchStatus,
  type SortKey,
  SORT_LABELS,
  hasActiveFilter,
} from '@/lib/leads/boardFilters';

const FLAG_META: { flag: ScoreFlag; label: string; varName: string }[] = [
  { flag: 'red', label: 'Red (poor)', varName: '--color-red' },
  { flag: 'amber', label: 'Amber (avg)', varName: '--color-amber' },
  { flag: 'green', label: 'Green (good)', varName: '--color-green' },
];

const PITCH_LABELS: Record<PitchStatus, string> = {
  all: 'All',
  sent: 'Pitch sent',
  not_sent: 'Not sent',
};

// Lightweight popover. Closes on outside-click + Escape. No portal — the menu
// is absolutely positioned under its trigger, which is fine inside the header.
function Dropdown({
  label,
  active,
  children,
}: {
  label: ReactNode;
  active: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold"
        style={{
          background: 'var(--color-bg2)',
          borderColor: active ? 'var(--color-blue, #4b8bf4)' : 'var(--color-border)',
          color: active ? 'var(--color-text)' : 'var(--color-text2)',
        }}
      >
        {label}
        <ChevronDown size={13} style={{ opacity: 0.5 }} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[190px] rounded-lg border p-1.5 shadow-xl"
          style={{ background: 'var(--color-surface2, #1c1f24)', borderColor: 'var(--color-border2)' }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  selected,
  onClick,
  multi,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px]"
      style={{ color: selected ? 'var(--color-text)' : 'var(--color-text2)' }}
    >
      {multi ? (
        <span
          className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border"
          style={{
            borderColor: selected ? 'var(--color-blue, #4b8bf4)' : 'var(--color-border2)',
            background: selected ? 'var(--color-blue, #4b8bf4)' : 'transparent',
          }}
        >
          {selected && <Check size={10} color="#fff" strokeWidth={3} />}
        </span>
      ) : (
        <span
          className="h-[15px] w-[15px] shrink-0 rounded-full border"
          style={{
            borderColor: selected ? 'var(--color-blue, #4b8bf4)' : 'var(--color-border2)',
            boxShadow: selected ? 'inset 0 0 0 3px var(--color-blue, #4b8bf4)' : 'none',
          }}
        />
      )}
      {children}
    </button>
  );
}

export function BoardToolbar({
  state,
  onChange,
  onClear,
}: {
  state: BoardFilterState;
  onChange: (patch: Partial<BoardFilterState>) => void;
  onClear: () => void;
}) {
  function toggleFlag(flag: ScoreFlag) {
    const has = state.scoreFlags.includes(flag);
    onChange({
      scoreFlags: has ? state.scoreFlags.filter((f) => f !== flag) : [...state.scoreFlags, flag],
    });
  }

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
      {/* Search */}
      <label
        className="flex min-w-[220px] items-center gap-2 rounded-md border px-2.5 py-1.5"
        style={{ background: 'var(--color-bg2)', borderColor: 'var(--color-border)' }}
      >
        <Search size={14} style={{ opacity: 0.5 }} />
        <input
          type="text"
          value={state.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search business…"
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: 'var(--color-text)' }}
        />
      </label>

      {/* Score (multi) */}
      <Dropdown
        active={state.scoreFlags.length > 0}
        label={
          <span className="flex items-center gap-1.5">
            Score
            {state.scoreFlags.length > 0 && (
              <span
                className="rounded-full px-1.5 text-[10px] font-extrabold leading-[1.4]"
                style={{ background: 'var(--color-blue, #4b8bf4)', color: '#fff' }}
              >
                {state.scoreFlags.length}
              </span>
            )}
          </span>
        }
      >
        {() =>
          FLAG_META.map(({ flag, label, varName }) => (
            <MenuRow key={flag} multi selected={state.scoreFlags.includes(flag)} onClick={() => toggleFlag(flag)}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(${varName})` }} />
              {label}
            </MenuRow>
          ))
        }
      </Dropdown>

      {/* Pitch (single) */}
      <Dropdown active={state.pitch !== 'all'} label={<>Pitch: {PITCH_LABELS[state.pitch]}</>}>
        {(close) =>
          (['all', 'sent', 'not_sent'] as PitchStatus[]).map((p) => (
            <MenuRow
              key={p}
              selected={state.pitch === p}
              onClick={() => {
                onChange({ pitch: p });
                close();
              }}
            >
              {PITCH_LABELS[p]}
            </MenuRow>
          ))
        }
      </Dropdown>

      {/* Unread toggle */}
      <button
        type="button"
        onClick={() => onChange({ unreadOnly: !state.unreadOnly })}
        className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold"
        style={{
          background: 'var(--color-bg2)',
          borderColor: state.unreadOnly ? 'var(--color-blue, #4b8bf4)' : 'var(--color-border)',
          color: state.unreadOnly ? 'var(--color-text)' : 'var(--color-text2)',
        }}
      >
        <span
          className="relative h-[17px] w-[30px] rounded-full transition-colors"
          style={{ background: state.unreadOnly ? 'var(--color-blue, #4b8bf4)' : 'var(--color-border2)' }}
        >
          <span
            className="absolute top-0.5 h-[13px] w-[13px] rounded-full bg-white transition-all"
            style={{ left: state.unreadOnly ? 15 : 2 }}
          />
        </span>
        Unread only
      </button>

      {/* Sort (single) */}
      <Dropdown active={state.sort !== 'name_asc'} label={<>Sort: {SORT_LABELS[state.sort]}</>}>
        {(close) =>
          (Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <MenuRow
              key={k}
              selected={state.sort === k}
              onClick={() => {
                onChange({ sort: k });
                close();
              }}
            >
              {SORT_LABELS[k]}
            </MenuRow>
          ))
        }
      </Dropdown>

      {/* Clear */}
      {hasActiveFilter(state) && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 px-1.5 py-1.5 text-[12.5px] font-semibold"
          style={{ color: 'var(--color-text3)' }}
        >
          <X size={13} /> Clear
        </button>
      )}
    </div>
  );
}
