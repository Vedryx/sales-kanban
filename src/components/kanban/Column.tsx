'use client';
import { useDroppable } from '@dnd-kit/core';
import type { StageId } from '@/lib/stages';
import type { ReactNode } from 'react';

export function Column({
  id,
  label,
  count,
  children,
}: {
  id: StageId;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="flex w-[260px] shrink-0 flex-col rounded-xl border"
      style={{
        background: 'var(--color-bg2)',
        borderColor: isOver ? 'var(--color-amber)' : 'var(--color-border)',
        boxShadow: isOver ? '0 0 0 1px var(--color-amber)' : 'none',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="text-[11px] font-bold tracking-wider uppercase">{label}</div>
        <div
          className="mono text-[11px] font-semibold"
          style={{ color: 'var(--color-text3)' }}
        >
          {count}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}
