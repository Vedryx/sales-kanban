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
  pagespeed?: number;
  pagespeedFlag?: 'red' | 'amber' | 'green';
  website?: string;
  stage: GranularStage;
  nextActionAt?: string | null;
  nextActionIntent?: string | null;
  lastNote?: string | null;
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
export type MeetingSummary = {
  id: string;
  text: string;
  at: string; // ISO
  by: string; // sdr email
};

// Detail pane projection — phone allowed (server → server fetch only).
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
  quote?: { amount: number | null; currency: 'USD'; sentAt: string | null };
  deal?: { amount: number | null; currency: 'USD'; closedAt: string | null };
  deposit?: { amount: number | null; paidAt: string | null };
  // Newest-first list of SDR-written meeting summaries. Rendered as a
  // collapsible in the detail pane; not projected onto the LeadCard.
  meetingSummaries?: MeetingSummary[];
};
