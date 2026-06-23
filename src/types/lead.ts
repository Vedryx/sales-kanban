import type { GranularStage } from '@/lib/stages';

// Card / board projection — what the kanban renders.
// PHONE IS NEVER ON THE CARD. Phone is fetched only when detail pane opens.
// EMAIL IS NEVER ON THE CARD either. Only existence flags survive.
export type LeadCard = {
  placeId: string;
  businessName: string;
  city?: string;
  state?: string;
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
};
