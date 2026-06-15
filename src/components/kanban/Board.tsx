'use client';
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { STAGES, columnFor, type StageId, type GranularStage } from '@/lib/stages';
import type { LeadCard } from '@/types/lead';
import { Column } from './Column';
import { LeadCardView } from './LeadCardView';
import { LeadDetailPane } from '../lead/LeadDetailPane';
import { BookMeetingModal } from '../meeting/BookMeetingModal';
import { Kpis } from './Kpis';

export function Board({ initialLeads }: { initialLeads: LeadCard[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [bookingLeadId, setBookingLeadId] = useState<string | null>(null);
  const [bookingLeadEmail, setBookingLeadEmail] = useState<string | undefined>(undefined);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
        className="border-b px-7 py-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-end justify-between">
          <div>
            <h1 className="m-0 text-[23px] font-extrabold tracking-tight">Pipeline</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text3)' }}>
              {leads.length} leads · drag cards between columns to update stage
            </p>
          </div>
          <div className="flex gap-2">
            <button
              disabled
              title="coming soon"
              className="cursor-not-allowed rounded-md border px-3 py-2 text-[12.5px] opacity-50"
              style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
            >
              + Add lead
            </button>
          </div>
        </div>
        <Kpis leads={leads} />
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto px-7 py-5">
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
