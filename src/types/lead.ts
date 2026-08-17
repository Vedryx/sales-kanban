import type { GranularStage } from '@/lib/stages';

// Card / board projection — what the kanban renders.
// PHONE IS NEVER ON THE CARD. Phone is fetched only when detail pane opens.
// EMAIL IS NEVER ON THE CARD either. Only existence flags survive.
export type LeadCard = {
  placeId: string;
  businessName: string;
  city?: string;
  state?: string;
  // Business vertical (e.g. 'dentist'). Written by the outbound-agent local
  // bridge on lead create; also filterable on the board. Optional so legacy
  // rows without the field don't need a backfill migration.
  vertical?: string;
  // Human-set section — an SDR-typed taxonomy tag, independent of `vertical`.
  // Persisted on sk_lead_state (see sales-kanban-sections work). Case
  // preserved as typed; normalized only for autocomplete / grouping /
  // filtering. `null` and missing both mean "unsectioned".
  section?: string | null;
  pagespeed?: number;
  pagespeedFlag?: 'red' | 'amber' | 'green';
  website?: string;
  stage: GranularStage;
  // Calendar day (YYYY-MM-DD) in the SDR's local timezone. Drives the card
  // colour state (red = today/past, yellow = within +2 days, else default).
  // Replaces the old `nextActionAt` / `nextActionIntent` datetime pair.
  nextReminderAt?: string | null;
  // Latest meeting-summary preview for the collapsed card. `text` is
  // pre-truncated to 140 chars in the projection layer so wire size stays
  // bounded regardless of how long the SDR types.
  latestMeetingSummary?: { text: string; at: string; by: string } | null;
  assignedTo?: string | null;
  hasEmail: boolean;
  hasPitchEmailSent: boolean;
  // ISO timestamp of the most recent inbound reply that hasn't been read.
  // Cleared logically by lastReadReplyAt >= unreadReplyAt (mark-read endpoint).
  // Card renders an "unread" badge whenever unreadReplyAt > (lastReadReplyAt ?? -inf).
  unreadReplyAt?: string | null;
  lastReadReplyAt?: string | null;
};

export type PagespeedMetrics = Record<string, number | string>;

export type PagespeedCategories = {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
};

export type PagespeedField = {
  lcpMs?: number;
  inpMs?: number;
  fcpMs?: number;
  cls?: number;
};

// Free-text meeting summary an SDR types into the lead pane after a
// call / demo. Append-only — every entry is kept for the audit trail.
// `by` is the SDR's email (never displayed as a link, just labelled).
// Two sentinel `by` values: `'legacy-note'` (synthesized from the retired
// `sk_lead_state.lastNote` field so pre-migration notes stay visible).
export type MeetingSummary = {
  id: string;
  text: string;
  at: string; // ISO
  by: string; // sdr email OR 'legacy-note'
};

// Detail pane projection — phone allowed (server → server fetch only).
// Money fields (quote/deal/deposit) intentionally omitted — those columns
// existed on the pane before this iteration and have been dropped. Legacy
// data still lives on the sk_lead_state doc but is no longer projected.
export type LeadDetail = LeadCard & {
  phone?: string;
  email?: string;
  ownerName?: string;
  timezone?: string;
  pagespeedMetrics?: PagespeedMetrics;
  pagespeedCategories?: PagespeedCategories;
  pagespeedField?: PagespeedField;
  securityGrade?: string;
  pitchEmailSentAt?: string | null;
  pitchEmailLastError?: string | null;
  // Full newest-first list of SDR-written meeting summaries. Rendered in
  // the detail pane; the card gets `latestMeetingSummary` (first entry,
  // preview-length text). May include a synthetic `legacy-note` entry
  // when `sk_lead_state.lastNote` is still populated (backfill script
  // has not yet been run).
  meetingSummaries?: MeetingSummary[];
};
