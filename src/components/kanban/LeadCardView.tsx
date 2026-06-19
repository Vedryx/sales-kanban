'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Mail } from 'lucide-react';
import type { LeadCard } from '@/types/lead';

export function LeadCardView({
  lead,
  onOpen,
  onBook,
}: {
  lead: LeadCard;
  onOpen: () => void;
  onBook: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.placeId,
  });

  const psColor =
    lead.pagespeedFlag === 'red'
      ? 'var(--color-red)'
      : lead.pagespeedFlag === 'amber'
        ? 'var(--color-amber)'
        : 'var(--color-green)';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        opacity: isDragging ? 0.4 : 1,
      }}
      className="rounded-lg border p-3 text-[12.5px]"
    >
      <div
        {...attributes}
        {...listeners}
        onClick={onOpen}
        className="cursor-pointer"
        role="button"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13.5px] font-bold tracking-tight">{lead.businessName}</div>
          <div className="flex shrink-0 items-center gap-1.5">
            {lead.hasPitchEmailSent && (
              <span
                title="Pitch email sent"
                aria-label="Pitch email sent"
                style={{ color: 'var(--color-text3)' }}
              >
                <Mail size={11} />
              </span>
            )}
            {lead.pagespeed != null && (
              <span
                className="mono rounded px-2 py-0.5 text-[10.5px] font-bold"
                style={{ background: 'var(--color-surface2)', color: psColor }}
              >
                PS={lead.pagespeed}
              </span>
            )}
          </div>
        </div>
        <div className="mt-1 text-[11.5px]" style={{ color: 'var(--color-text3)' }}>
          {[lead.city, lead.state].filter(Boolean).join(', ') || '—'}
        </div>
        {lead.lastNote && (
          <div
            className="mt-2 line-clamp-2 text-[11.5px] italic"
            style={{ color: 'var(--color-text2)' }}
          >
            &ldquo;{lead.lastNote}&rdquo;
          </div>
        )}
        {lead.nextActionAt && (
          <div className="mono mt-2 text-[10.5px]" style={{ color: 'var(--color-amber)' }}>
            next: {new Date(lead.nextActionAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBook();
          }}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-semibold max-lg:px-2.5 max-lg:py-1.5"
          style={{
            background: 'transparent',
            borderColor: 'var(--color-border2)',
            color: 'var(--color-amber)',
          }}
        >
          <Calendar size={11} /> Book G-Meet
        </button>
      </div>
    </div>
  );
}
