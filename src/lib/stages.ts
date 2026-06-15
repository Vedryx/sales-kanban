export const STAGES = [
  { id: 'new', label: 'New', dot: 'amber' },
  { id: 'dialing', label: 'Dialing', dot: 'amber' },
  { id: 'connected', label: 'Connected', dot: 'amber' },
  { id: 'demo_booked', label: 'Demo Booked', dot: 'green' },
  { id: 'quote_sent', label: 'Quote Sent', dot: 'green' },
  { id: 'verbal_yes', label: 'Verbal Yes', dot: 'green' },
  { id: 'closed', label: 'Closed', dot: 'red' }, // collapsed cluster (won/lost/dnc)
] as const;

export type StageId = (typeof STAGES)[number]['id'];

// Granular closed values — stored, rendered under one "closed" column
export type GranularStage =
  | 'new'
  | 'dialing'
  | 'connected'
  | 'demo_booked'
  | 'quote_sent'
  | 'verbal_yes'
  | 'closed_won'
  | 'closed_lost'
  | 'closed_dnc';

export function columnFor(stage: GranularStage): StageId {
  if (stage.startsWith('closed_')) return 'closed';
  return stage as StageId;
}

export const CLOSED_STAGES: GranularStage[] = ['closed_won', 'closed_lost', 'closed_dnc'];
export const LOST_OR_DNC: GranularStage[] = ['closed_lost', 'closed_dnc'];
