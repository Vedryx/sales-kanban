import type { GranularStage } from '@/lib/stages';

// Card / board projection — what the kanban renders.
// PHONE IS NEVER ON THE CARD. Phone is fetched only when detail pane opens.
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
};

// Detail pane projection — phone allowed (server → server fetch only).
export type LeadDetail = LeadCard & {
  phone?: string;
  email?: string;
  ownerName?: string;
  timezone?: string;
  quote?: { amount: number | null; currency: 'USD'; sentAt: string | null };
  deal?: { amount: number | null; currency: 'USD'; closedAt: string | null };
  deposit?: { amount: number | null; paidAt: string | null };
};
