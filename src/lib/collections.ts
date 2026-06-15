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
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
