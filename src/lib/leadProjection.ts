// Single source of truth for what fields leave the DB.
// NEVER return phone in card-shaped projections — only in detail.
import type { LeadCard, LeadDetail } from '@/types/lead';
import type { GranularStage } from '@/lib/stages';

export type RawLeadDoc = {
  placeId?: string;
  place_id?: string;
  name?: string;
  business?: string;
  city?: string;
  state?: string;
  pagespeed?: number;
  pagespeedScore?: number;
  pagespeedFlag?: 'red' | 'amber' | 'green';
  website?: string;
  phone?: string;
  email?: string;
  ownerName?: string;
  timezone?: string;
  state_data?: {
    stage?: GranularStage;
    nextActionAt?: string | null;
    nextActionIntent?: string | null;
    lastNote?: string | null;
    assignedTo?: string | null;
    quote?: LeadDetail['quote'];
    deal?: LeadDetail['deal'];
    deposit?: LeadDetail['deposit'];
  };
};

export function toCard(raw: RawLeadDoc): LeadCard {
  const placeId = raw.placeId ?? raw.place_id ?? '';
  const s = raw.state_data ?? {};
  return {
    placeId,
    businessName: raw.name ?? raw.business ?? 'Unknown business',
    city: raw.city,
    state: raw.state,
    pagespeed: raw.pagespeed ?? raw.pagespeedScore,
    pagespeedFlag: raw.pagespeedFlag,
    website: raw.website,
    stage: s.stage ?? 'new',
    nextActionAt: s.nextActionAt ?? null,
    nextActionIntent: s.nextActionIntent ?? null,
    lastNote: s.lastNote ?? null,
    assignedTo: s.assignedTo ?? null,
    hasEmail: !!raw.email,
  };
}

export function toDetail(raw: RawLeadDoc): LeadDetail {
  const card = toCard(raw);
  const s = raw.state_data ?? {};
  return {
    ...card,
    phone: raw.phone,
    email: raw.email,
    ownerName: raw.ownerName,
    timezone: raw.timezone,
    quote: s.quote,
    deal: s.deal,
    deposit: s.deposit,
  };
}
