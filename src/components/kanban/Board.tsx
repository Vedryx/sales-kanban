'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { STAGES, columnFor, type StageId, type GranularStage } from '@/lib/stages';
import type { LeadCard } from '@/types/lead';
import { Column } from './Column';
import { LeadCardView } from './LeadCardView';
import { LeadDetailPane } from '../lead/LeadDetailPane';
import { BookMeetingModal } from '../meeting/BookMeetingModal';
import { AddLeadModal } from './AddLeadModal';
import { Kpis } from './Kpis';
import { BoardToolbar } from './BoardToolbar';
import {
  type BoardFilterState,
  DEFAULT_FILTER_STATE,
  applyFilterSort,
  loadFilterState,
  saveFilterState,
} from '@/lib/leads/boardFilters';
import {
  UNASSIGNED_KEY,
  UNASSIGNED_LABEL,
  deriveSectionOptions,
  groupLeadsBySection,
  loadLaneCollapse,
  saveLaneCollapse,
  sectionKeyOf,
} from '@/lib/leads/sectionGrouping';

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

export function Board({
  initialLeads,
  initialFilters,
}: {
  initialLeads: LeadCard[];
  // Dev-only override — when provided, skips localStorage hydration +
  // persistence so the /dev/preview harness can force `groupBy: section`
  // for the mobile-evidence swimlane pass without polluting a real SDR's
  // stored filter state. Never set from production render paths.
  initialFilters?: BoardFilterState;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [bookingLeadId, setBookingLeadId] = useState<string | null>(null);
  const [bookingLeadEmail, setBookingLeadEmail] = useState<string | undefined>(undefined);
  const [addingLead, setAddingLead] = useState(false);

  // Filter/sort state. Initialise to defaults for a stable SSR/first paint,
  // then hydrate from localStorage on mount (client-only) to avoid a
  // hydration mismatch. Persist on every change. Preview harness override
  // (initialFilters) bypasses both hydration + persistence.
  const [filters, setFilters] = useState<BoardFilterState>(
    initialFilters ?? DEFAULT_FILTER_STATE,
  );
  const filtersHydrated = useRef(false);
  useEffect(() => {
    if (initialFilters) {
      filtersHydrated.current = true;
      return;
    }
    setFilters(loadFilterState());
    filtersHydrated.current = true;
  }, [initialFilters]);
  useEffect(() => {
    if (initialFilters) return; // preview harness — never persist
    // Skip the pre-hydration write so we never clobber stored state with the
    // default on first render.
    if (filtersHydrated.current) saveFilterState(filters);
  }, [filters, initialFilters]);

  const patchFilters = (patch: Partial<BoardFilterState>) =>
    setFilters((prev) => ({ ...prev, ...patch }));
  // Clear resets the filters but preserves the chosen sort AND the current
  // grouping mode — neither hides cards, so neither is a "filter" (see
  // cto.md §2.5). Explicit preservation prevents accidental regressions
  // when someone extends the toolbar.
  const clearFilters = () =>
    setFilters((prev) => ({
      ...DEFAULT_FILTER_STATE,
      sort: prev.sort,
      groupBy: prev.groupBy,
    }));

  // Lane collapse — separate localStorage key from filter state so per-lane
  // collapse survives filter resets (cto.md §2.6). Keyed by sectionKeyOf
  // output; stale keys stay in localStorage harmlessly (ignored on read).
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, true>>({});
  const collapseHydrated = useRef(false);
  useEffect(() => {
    setCollapsedLanes(loadLaneCollapse());
    collapseHydrated.current = true;
  }, []);
  useEffect(() => {
    if (collapseHydrated.current) saveLaneCollapse(collapsedLanes);
  }, [collapsedLanes]);
  const toggleLaneCollapse = (key: string) => {
    setCollapsedLanes((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  // Source-lane tracking for the active drag. Set on drag start so cross-
  // lane droppable cells can suppress their `isOver` amber affordance
  // (design-lead.md §3.4 — affordance = behaviour). Cleared on drag end /
  // cancel so a stale value never gates highlights on the next drag.
  const [activeLaneKey, setActiveLaneKey] = useState<string | null>(null);

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

  // Filter + sort the full set once, then bucket into columns. Sort order is
  // preserved within each column because applyFilterSort sorts before we
  // split. KPIs intentionally read the unfiltered `leads` (pipeline totals).
  const visibleLeads = useMemo(() => applyFilterSort(leads, filters), [leads, filters]);

  // Distinct, sorted vertical values across the loaded board. Recomputed
  // when leads mutate; drives the vertical dropdown in BoardToolbar.
  const verticalOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) if (l.vertical) set.add(l.vertical);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  // Distinct, canonical section labels across the loaded board. Feeds the
  // toolbar filter, the AddLead modal datalist, and the LeadDetailPane
  // datalist. Case-insensitive dedup; first-seen exact form is canonical.
  const sectionOptions = useMemo(() => deriveSectionOptions(leads), [leads]);

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
    for (const lead of visibleLeads) map[columnFor(lead.stage)].push(lead);
    return map;
  }, [visibleLeads]);

  // Swimlane groups — only computed when grouping is on. Handles the
  // §3.5 empty-lane edge case: if the section filter is set to a
  // specific section (or __unassigned__) and every card in that lane is
  // hidden by other filters, we still synthesize the lane so the SDR
  // sees "why is my selected section empty?" rather than a blank board.
  const sectionGroups = useMemo(() => {
    if (filters.groupBy !== 'section') return [];
    const derived = groupLeadsBySection(visibleLeads);
    if (filters.section === '') return derived;
    const wantKey =
      filters.section === UNASSIGNED_KEY
        ? UNASSIGNED_KEY
        : filters.section.trim().toLowerCase();
    if (derived.some((g) => g.key === wantKey)) return derived;
    // Synthesize the empty lane so the empty-state (design §3.5) renders.
    const emptyLabel =
      filters.section === UNASSIGNED_KEY ? UNASSIGNED_LABEL : filters.section;
    return [{ key: wantKey, label: emptyLabel, leads: [] as LeadCard[] }];
  }, [filters.groupBy, filters.section, visibleLeads]);

  // Per-lane, per-column bucketing. Same shape as `byColumn` above but
  // keyed by lane so each lane's Column receives just that lane's cards.
  const byLaneAndColumn = useMemo(() => {
    if (filters.groupBy !== 'section') return null;
    const out = new Map<string, Record<StageId, LeadCard[]>>();
    for (const group of sectionGroups) {
      const map: Record<StageId, LeadCard[]> = {
        new: [],
        dialing: [],
        connected: [],
        demo_booked: [],
        quote_sent: [],
        verbal_yes: [],
        closed: [],
      };
      for (const lead of group.leads) map[columnFor(lead.stage)].push(lead);
      out.set(group.key, map);
    }
    return out;
  }, [filters.groupBy, sectionGroups]);

  // Swimlane mode uses composite droppable ids `${laneKey}::${stageId}`
  // (one droppable per (lane, stage) cell). Non-swimlane mode keeps the
  // bare `stageId` — legacy behaviour bit-for-bit. This helper is the
  // single parse path so any future format tweak lives in one place.
  function parseDroppableId(id: string): { lane: string | null; stage: StageId } {
    if (id.includes('::')) {
      const [lane, stage] = id.split('::', 2);
      return { lane, stage: stage as StageId };
    }
    return { lane: null, stage: id as StageId };
  }

  function handleDragStart(event: DragStartEvent) {
    const placeId = String(event.active.id);
    const lead = leads.find((l) => l.placeId === placeId);
    if (!lead) {
      setActiveLaneKey(null);
      return;
    }
    // Only track active lane when grouping is on — no need to gate
    // highlights when every cell is eligible anyway.
    setActiveLaneKey(filters.groupBy === 'section' ? sectionKeyOf(lead.section) : null);
  }

  function handleDragCancel() {
    setActiveLaneKey(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Always clear the active lane — even on a no-op drop — so a stale
    // value can never leak into the next drag's highlight gating.
    setActiveLaneKey(null);
    if (!over) return;
    const placeId = String(active.id);
    const { lane: targetLane, stage: overCol } = parseDroppableId(String(over.id));
    const lead = leads.find((l) => l.placeId === placeId);
    if (!lead) return;
    // Swimlane-mode cross-lane drop = silent no-op (cto.md §2.4 — C+).
    // Section is only editable from the pane; a drag never mutates it.
    if (targetLane !== null) {
      const sourceLane = sectionKeyOf(lead.section);
      if (sourceLane !== targetLane) return;
    }
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
              {visibleLeads.length === leads.length
                ? `${leads.length} leads`
                : `${visibleLeads.length} of ${leads.length} leads`}
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
        <BoardToolbar
          state={filters}
          onChange={patchFilters}
          onClear={clearFilters}
          verticalOptions={verticalOptions}
          sectionOptions={sectionOptions}
        />
        <Kpis leads={leads} />
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {filters.groupBy === 'section' && byLaneAndColumn ? (
          // Swimlane mode: vertical stack of lanes, each with its own
          // horizontal column scroller. Lane headers stay outside the
          // per-lane scroller so the title never leaves view when the
          // SDR scrolls columns horizontally (design-lead.md §2.1).
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto max-lg:px-4 max-lg:py-3 lg:gap-5 lg:px-7 lg:py-5">
            {sectionGroups.map((group) => {
              const collapsed = !!collapsedLanes[group.key];
              const isUnassigned = group.key === UNASSIGNED_KEY;
              const laneCount = group.leads.length;
              const laneEmpty = laneCount === 0;
              return (
                <div
                  key={group.key}
                  className="flex flex-col gap-[10px]"
                  data-lane-key={group.key}
                >
                  <button
                    type="button"
                    onClick={() => toggleLaneCollapse(group.key)}
                    aria-expanded={!collapsed}
                    aria-label={`Toggle section ${group.label}, ${laneCount} cards`}
                    className="flex w-full items-center gap-2 rounded-lg border px-3"
                    style={{
                      height: 40,
                      background: 'var(--color-bg2)',
                      borderColor: 'var(--color-border)',
                    }}
                    data-lane-header
                  >
                    {collapsed ? (
                      <ChevronRight size={15} style={{ color: 'var(--color-text3)' }} />
                    ) : (
                      <ChevronDown size={15} style={{ color: 'var(--color-text3)' }} />
                    )}
                    <span
                      className={
                        isUnassigned
                          ? 'truncate text-[13px] font-bold tracking-tight'
                          : 'truncate text-[13px] font-extrabold tracking-tight'
                      }
                      style={{
                        color: isUnassigned ? 'var(--color-text3)' : 'var(--color-text)',
                      }}
                      title={group.label}
                    >
                      {group.label}
                    </span>
                    <span
                      className="mono ml-auto text-[11px] font-semibold"
                      style={{ color: 'var(--color-text3)' }}
                      title={`${laneCount} cards`}
                    >
                      {laneCount}
                    </span>
                  </button>
                  {!collapsed &&
                    (laneEmpty ? (
                      <div
                        className="text-[12.5px]"
                        style={{
                          color: 'var(--color-text3)',
                          padding: '12px 4px',
                        }}
                      >
                        No cards in this section match the current filters.
                      </div>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto max-lg:-mx-4 max-lg:snap-x max-lg:snap-mandatory max-lg:px-4">
                        {STAGES.map((stage) => {
                          const laneMap = byLaneAndColumn.get(group.key);
                          const cards = laneMap ? laneMap[stage.id] : [];
                          const eligible =
                            activeLaneKey === null || activeLaneKey === group.key;
                          return (
                            <Column
                              key={stage.id}
                              id={stage.id}
                              droppableId={`${group.key}::${stage.id}`}
                              label={stage.label}
                              count={cards.length}
                              highlightEligible={eligible}
                              // 240 @ mobile (<768), 296 @ 768+. Design
                              // §2.2 is explicit: 296 at BOTH 768 and 1280
                              // (Tailwind `md:` = 768+). `lg:` would only
                              // trigger at 1024+ and leave 768 stuck at 240.
                              bodyMaxHeightClass="max-h-[240px] min-h-[120px] md:max-h-[296px]"
                            >
                              {cards.map((lead) => (
                                <LeadCardView
                                  key={lead.placeId}
                                  lead={lead}
                                  onOpen={() => setOpenLeadId(lead.placeId)}
                                  onBook={() => {
                                    setBookingLeadEmail(undefined);
                                    setBookingLeadId(lead.placeId);
                                  }}
                                />
                              ))}
                            </Column>
                          );
                        })}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        ) : (
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
        )}
      </DndContext>

      {openLeadId && (
        <LeadDetailPane
          placeId={openLeadId}
          sectionOptions={sectionOptions}
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
          onDeleted={(deletedId) => {
            // Optimistic drop — the DELETE already succeeded server-side.
            // Also close the pane and clear any related state so a stale
            // ref to the deleted lead can't linger (e.g. booking modal).
            setLeads((arr) => arr.filter((l) => l.placeId !== deletedId));
            setOpenLeadId(null);
            if (bookingLeadId === deletedId) {
              setBookingLeadId(null);
              setBookingLeadEmail(undefined);
            }
            toast.success('Lead deleted.');
          }}
        />
      )}
      {addingLead && (
        <AddLeadModal
          sectionOptions={sectionOptions}
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
