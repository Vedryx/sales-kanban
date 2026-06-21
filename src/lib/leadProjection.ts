// Single source of truth for what fields leave the DB.
// NEVER return phone or raw email in card-shaped projections — only in detail.
import type { LeadCard, LeadDetail, PagespeedMetrics } from '@/types/lead';
import type { GranularStage } from '@/lib/stages';

export type RawLeadDoc = {
  placeId?: string;
  place_id?: string;
  name?: string;
  business?: string;
  city?: string;
  state?: unknown;
  pagespeed?: number;
  pagespeedScore?: number;
  pagespeedFlag?: 'red' | 'amber' | 'green';
  pagespeedMetrics?: PagespeedMetrics;
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
    email?: string | null; // SDR override (lives on sk_lead_state)
    pitchEmailSentAt?: string | null;
    pitchEmailLastError?: string | null;
    quote?: LeadDetail['quote'];
    deal?: LeadDetail['deal'];
    deposit?: LeadDetail['deposit'];
  };
};

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

// Effective email = SDR override if set, else valid_pulse_leads.email.
// Writing null clears the override (falls back to the raw source).
function effectiveEmail(raw: RawLeadDoc): string | undefined {
  const override = raw.state_data?.email;
  if (typeof override === 'string' && override.trim() !== '') return override;
  if (override === null) return undefined; // explicit clear
  return raw.email && raw.email.trim() !== '' ? raw.email : undefined;
}

export function toCard(raw: RawLeadDoc): LeadCard {
  const placeId = raw.placeId ?? raw.place_id ?? '';
  const s = raw.state_data ?? {};
  return {
    placeId,
    businessName: raw.name ?? raw.business ?? 'Unknown business',
    city: optionalText(raw.city),
    state: optionalText(raw.state),
    pagespeed: raw.pagespeed ?? raw.pagespeedScore,
    pagespeedFlag: raw.pagespeedFlag,
    website: raw.website,
    stage: s.stage ?? 'new',
    nextActionAt: s.nextActionAt ?? null,
    nextActionIntent: s.nextActionIntent ?? null,
    lastNote: s.lastNote ?? null,
    assignedTo: s.assignedTo ?? null,
    hasEmail: !!effectiveEmail(raw),
    hasPitchEmailSent: !!s.pitchEmailSentAt,
  };
}

export function toDetail(raw: RawLeadDoc): LeadDetail {
  const card = toCard(raw);
  const s = raw.state_data ?? {};
  return {
    ...card,
    phone: raw.phone,
    email: effectiveEmail(raw),
    ownerName: raw.ownerName,
    timezone: raw.timezone,
    pagespeedMetrics: raw.pagespeedMetrics,
    pitchEmailSentAt: s.pitchEmailSentAt ?? null,
    pitchEmailLastError: s.pitchEmailLastError ?? null,
    quote: s.quote,
    deal: s.deal,
    deposit: s.deposit,
  };
}
