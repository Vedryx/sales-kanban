'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Mail } from 'lucide-react';
import type { LeadCard } from '@/types/lead';
import { isUnreadReply } from '@/lib/leads/unread';
import { reminderCardState, reminderChipLabel } from '@/lib/leads/reminderState';

// Design §2 — three colour states driven by nextReminderAt. Applied as
// border + optional soft-tint background + inset left-edge accent bar. No
// pseudo-element or extra DOM node so isDragging opacity and drag handles
// stay consistent with the default state.
type CardStyleParts = {
  background: string;
  border: string;
  boxShadow: string;
};

function cardStyleFor(state: ReturnType<typeof reminderCardState>): CardStyleParts {
  if (state === 'red') {
    return {
      background: 'var(--color-red-soft)',
      border: '1px solid var(--color-red)',
      boxShadow: 'inset 4px 0 0 var(--color-red)',
    };
  }
  if (state === 'yellow') {
    return {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-amber)',
      boxShadow: 'inset 4px 0 0 var(--color-amber)',
    };
  }
  return {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    boxShadow: 'none',
  };
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

// Strip the domain from an SDR email so the card attribution stays short.
// Sentinel `by === 'legacy-note'` is handled separately by the caller.
function shortenBy(by: string): string {
  const at = by.indexOf('@');
  return at > 0 ? by.slice(0, at) : by;
}

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

  const unread = isUnreadReply(lead);
  const state = reminderCardState(lead.nextReminderAt);
  const style = cardStyleFor(state);
  const reminderLabel = lead.nextReminderAt ? reminderChipLabel(lead.nextReminderAt) : '';
  const reminderPalette =
    state === 'red'
      ? { color: 'var(--color-red)', background: 'rgba(227,132,118,0.22)' }
      : state === 'yellow'
        ? { color: 'var(--color-amber)', background: 'var(--color-amber-soft)' }
        : null;

  return (
    <div
      ref={setNodeRef}
      data-reminder-state={state}
      style={{
        transform: CSS.Translate.toString(transform),
        background: style.background,
        border: style.border,
        boxShadow: style.boxShadow,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="rounded-lg p-3 text-[12.5px]"
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
            {unread && (
              <span
                title="New reply"
                aria-label="New inbound reply"
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                style={{
                  background: 'var(--color-amber)',
                  color: '#1b1715',
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: '#1b1715' }}
                />
                New
              </span>
            )}
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
            {reminderPalette && reminderLabel && (
              <span
                className="mono rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                style={reminderPalette}
                aria-label={`Reminder: ${reminderLabel.replace(/^Rem:\s*/, '')}`}
                title={reminderLabel}
              >
                {reminderLabel}
              </span>
            )}
          </div>
        </div>
        <div className="mt-1 text-[11.5px]" style={{ color: 'var(--color-text3)' }}>
          {[lead.city, lead.state].filter(Boolean).join(', ') || '—'}
        </div>
        {lead.latestMeetingSummary && (
          <>
            <div
              className="mt-2 text-[11.5px] italic"
              style={{
                color: 'var(--color-text2)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
              }}
            >
              &ldquo;{lead.latestMeetingSummary.text}&rdquo;
            </div>
            <div
              className="mono mt-1 text-[10.5px]"
              style={{ color: 'var(--color-text3)' }}
            >
              — {lead.latestMeetingSummary.by === 'legacy-note'
                ? 'note'
                : shortenBy(lead.latestMeetingSummary.by)}
              {' · '}
              {formatRelative(lead.latestMeetingSummary.at)}
            </div>
          </>
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
