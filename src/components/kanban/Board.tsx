'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { STAGES, columnFor, type StageId, type GranularStage } from '@/lib/stages';
import type { LeadCard } from '@/types/lead';
import { Column } from './Column';
import { LeadCardView } from './LeadCardView';
import { LeadDetailPane } from '../lead/LeadDetailPane';
import { BookMeetingModal } from '../meeting/BookMeetingModal';
import { AddLeadModal } from './AddLeadModal';
import { Kpis } from './Kpis';

type UnreadRow = {
  placeId: string;
  businessName: string;
  unreadReplyAt: string;
  lastReadReplyAt: string | null;
  latestReplyFrom: string | null;
  latestReplySubject: string | null;
};

// Polling interval for /api/inbound/unread. 30s matches the founder-approved
// v1 spec (goals/inbound-reply-capture.md) — realtime via SSE is a follow-up.
const UNREAD_POLL_MS = 30_000;

export function Board({ initialLeads }: { initialLeads: LeadCard[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [bookingLeadId, setBookingLeadId] = useState<string | null>(null);
  const [bookingLeadEmail, setBookingLeadEmail] = useState<string | undefined>(undefined);
  const [addingLead, setAddingLead] = useState(false);

  // The set of placeIds we've already toasted this session — so the user
  // doesn't get the same toast every 30s for the same unread reply.
  // Kept in a ref (not state) because toggling it shouldn't re-render.
  const toastedRef = useRef<Set<string>>(new Set());
  // Tracks the last seen unreadReplyAt per placeId so a NEW reply on a
  // lead we've already toasted re-fires the toast.
  const lastSeenTsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch('/api/inbound/unread');
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; unread: UnreadRow[] };
        if (cancelled || !data.ok) return;

        // Merge unread state onto local cards for badge rendering.
        setLeads((arr) => {
          const byId = new Map(data.unread.map((u) => [u.placeId, u]));
          let changed = false;
          const next = arr.map((l) => {
            const u = byId.get(l.placeId);
            if (u) {
              if (
                l.unreadReplyAt !== u.unreadReplyAt ||
                l.lastReadReplyAt !== u.lastReadReplyAt
              ) {
                changed = true;
                return {
                  ...l,
                  unreadReplyAt: u.unreadReplyAt,
                  lastReadReplyAt: u.lastReadReplyAt,
                };
              }
              return l;
            }
            // No longer unread — clear local mirror so the badge drops.
            if (l.unreadReplyAt) {
              changed = true;
              return { ...l, unreadReplyAt: null };
            }
            return l;
          });
          return changed ? next : arr;
        });

        // Fire toasts for placeIds we haven't toasted yet OR whose
        // unreadReplyAt is strictly newer than last seen.
        for (const u of data.unread) {
          const prev = lastSeenTsRef.current.get(u.placeId);
          const isNew = !toastedRef.current.has(u.placeId) || (prev && prev !== u.unreadReplyAt);
          if (isNew) {
            toast(`New reply from ${u.businessName}`, {
              description: u.latestReplySubject ?? undefined,
              action: {
                label: 'Open',
                onClick: () => setOpenLeadId(u.placeId),
              },
            });
            toastedRef.current.add(u.placeId);
            lastSeenTsRef.current.set(u.placeId, u.unreadReplyAt);
          }
        }
      } catch {
        // Network blip — swallow; next tick will retry.
      } finally {
        if (!cancelled) {
          timerId = setTimeout(poll, UNREAD_POLL_MS);
        }
      }
    }

    // Kick off immediately so the badge shows on initial render without
    // a 30s wait. Subsequent ticks are scheduled via setTimeout chain
    // (not setInterval) so a slow request can't pile up overlapping calls.
    poll();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  // Mouse: 4px distance threshold — preserved from prior PointerSensor config
  // so desktop drag activation feels identical to main.
  // Touch: 200ms press-hold before drag activates — lets users scroll the
  // column lane horizontally with a swipe without immediately starting a drag.
  // MouseSensor (mouse-only) + TouchSensor (touch-only) is the canonical
  // dnd-kit pattern for swipe-vs-drag. PointerSensor would accept touch
  // pointerdown and race the TouchSensor delay, breaking lane scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const byColumn = useMemo(() => {
    const map: Record<StageId, LeadCard[]> = {
      new: [],
      dialing: [],
      connected: [],
      demo_booked: [],
      quote_sent: [],
      verbal_yes: [],
      closed: [],
    };
    for (const lead of leads) map[columnFor(lead.stage)].push(lead);
    return map;
  }, [leads]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const placeId = String(active.id);
    const overCol = String(over.id) as StageId;
    const lead = leads.find((l) => l.placeId === placeId);
    if (!lead) return;
    if (columnFor(lead.stage) === overCol) return;
    // Map closed column to closed_lost as default for now (UX TBD; founder can re-decide)
    const newStage: GranularStage = overCol === 'closed' ? 'closed_lost' : (overCol as GranularStage);
    setLeads((arr) => arr.map((l) => (l.placeId === placeId ? { ...l, stage: newStage } : l)));
    try {
      await fetch(`/api/leads/${encodeURIComponent(placeId)}/stage`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch {
      // Rollback on failure
      setLeads((arr) => arr.map((l) => (l.placeId === placeId ? { ...l, stage: lead.stage } : l)));
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header
        className="border-b max-lg:px-4 max-lg:py-3 lg:px-7 lg:py-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-end justify-between max-sm:flex-col max-sm:items-start max-sm:gap-2">
          <div>
            <h1 className="m-0 text-[23px] font-extrabold tracking-tight">Pipeline</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text3)' }}>
              {leads.length} leads
              <span className="max-sm:hidden"> · drag cards between columns to update stage</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAddingLead(true)}
              className="rounded-md border px-3 py-2 text-[12.5px] font-bold"
              style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
            >
              + Add lead
            </button>
          </div>
        </div>
        <Kpis leads={leads} />
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto max-lg:snap-x max-lg:snap-mandatory max-lg:px-4 max-lg:py-3 lg:px-7 lg:py-5">
          {STAGES.map((stage) => (
            <Column key={stage.id} id={stage.id} label={stage.label} count={byColumn[stage.id].length}>
              {byColumn[stage.id].map((lead) => (
                <LeadCardView
                  key={lead.placeId}
                  lead={lead}
                  onOpen={() => setOpenLeadId(lead.placeId)}
                  onBook={() => {
                    // From the card we don't have the email (cards omit PII).
                    // Modal will receive undefined; user can paste it in.
                    setBookingLeadEmail(undefined);
                    setBookingLeadId(lead.placeId);
                  }}
                />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>

      {openLeadId && (
        <LeadDetailPane
          placeId={openLeadId}
          onClose={() => setOpenLeadId(null)}
          onBook={(leadEmail) => {
            setBookingLeadEmail(leadEmail);
            setBookingLeadId(openLeadId);
          }}
          onPatched={(patch) =>
            setLeads((arr) =>
              arr.map((l) => (l.placeId === openLeadId ? { ...l, ...patch } : l)),
            )
          }
        />
      )}
      {addingLead && (
        <AddLeadModal
          onClose={() => setAddingLead(false)}
          onCreated={(lead) => setLeads((arr) => [lead, ...arr])}
        />
      )}
      {bookingLeadId && (
        <BookMeetingModal
          placeId={bookingLeadId}
          businessName={leads.find((l) => l.placeId === bookingLeadId)?.businessName ?? ''}
          leadEmail={bookingLeadEmail}
          onClose={() => {
            setBookingLeadId(null);
            setBookingLeadEmail(undefined);
          }}
        />
      )}
    </div>
  );
}
