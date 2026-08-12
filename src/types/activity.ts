export type ActivityType =
  | 'stage_move'
  | 'disposition'
  | 'note'
  | 'meeting_booked'
  | 'meeting_cancelled'
  | 'meeting_rescheduled'
  | 'meeting_completed'
  | 'meeting_no_show'
  | 'phone_viewed'
  | 'quote_sent'
  | 'deal_won'
  | 'money_update'
  | 'pitch_email'
  | 'inbound_reply'
  | 'lead_created'
  | 'meeting_summary';

export type Activity = {
  _id?: string;
  leadPlaceId: string;
  sdrEmail: string;
  sdrName?: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: string;
  isSystem?: boolean;
};
