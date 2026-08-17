'use client';
import { useDroppable } from '@dnd-kit/core';
import type { StageId } from '@/lib/stages';
import type { ReactNode } from 'react';

export function Column({
  id,
  droppableId,
  label,
  count,
  highlightEligible = true,
  bodyMaxHeightClass,
  children,
}: {
  // Display / logical identity of the column (used for the label + as the
  // default droppable id). Non-swimlane mode passes only `id`.
  id: StageId;
  // Optional distinct dnd-kit droppable id — swimlane mode passes
  // `${laneKey}::${stageId}` so each (lane, stage) cell is its own drop
  // target. See cto-design-review.md §4.1.
  droppableId?: string;
  label: string;
  count: number;
  // Gate on the amber `isOver` affordance. Swimlane mode passes `false` for
  // cells in a different lane than the dragged card's source, so cross-lane
  // cells stay quiet (absence of affordance = "can't drop here"). See
  // design-lead.md §3.4. Default `true` preserves today's behaviour.
  highlightEligible?: boolean;
  // Optional Tailwind class(es) applied to the column body. Swimlane mode
  // passes `max-h-[240px] lg:max-h-[296px] min-h-[120px]` so lanes fit the
  // per-viewport caps in design-lead.md §2.2 while still showing an empty
  // drop zone. Non-swimlane mode leaves this undefined and the body keeps
  // its today `flex-1` full-height behaviour.
  bodyMaxHeightClass?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId ?? id });
  const showOverAffordance = isOver && highlightEligible;

  return (
    <div
      ref={setNodeRef}
      className="flex w-[260px] shrink-0 flex-col rounded-xl border max-sm:w-[85vw] max-sm:max-w-[320px] max-lg:snap-start"
      style={{
        background: 'var(--color-bg2)',
        borderColor: showOverAffordance ? 'var(--color-amber)' : 'var(--color-border)',
        boxShadow: showOverAffordance ? '0 0 0 1px var(--color-amber)' : 'none',
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
      <div
        className={
          bodyMaxHeightClass
            ? `flex flex-col gap-2 overflow-y-auto p-2 ${bodyMaxHeightClass}`
            : 'flex flex-1 flex-col gap-2 overflow-y-auto p-2'
        }
      >
        {children}
      </div>
    </div>
  );
}
