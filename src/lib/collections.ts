import { isPreview } from './env';

const suffix = (name: string) => (isPreview ? `${name}_preview` : name);

export const COLLECTIONS = {
  sk_users: suffix('sk_users'),
  sk_meetings: suffix('sk_meetings'),
  sk_activities: suffix('sk_activities'),
  sk_lead_state: suffix('sk_lead_state'),
  // READ-only source. Preview reads from the same source — the cron's
  // preview pattern uses suffix too; mirror it.
  valid_pulse_leads: suffix('valid_pulse_leads'),
  // Inbound replies whose From address doesn't match any known lead's email.
  // Stored as a triage queue (small) so the team can decide whether to
  // attach manually. Suffixed in preview to keep preview noise separated.
  sk_inbound_unmatched: suffix('sk_inbound_unmatched'),
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
