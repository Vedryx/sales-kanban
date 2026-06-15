export type MeetingType = 'gmeet' | 'phone' | 'inperson';
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

// 17-field meeting doc per Sales Lead §3.
export type Meeting = {
  _id?: string;
  leadPlaceId: string;
  leadBusinessName: string; // denorm for fast queue render
  sdrEmail: string;
  title: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  timezone: string;
  durationMin: 15 | 30 | 45 | 60;
  attendeeEmails: string[];
  meetingUrl: string | null;
  inPersonAddress: string | null;
  meetingType: MeetingType;
  agenda: string | null;
  status: MeetingStatus;
  googleEventId: string | null;
  googleCalendarId: string | null;
  leadEmailSent: boolean;
  createdAt: string;
  updatedAt: string;
};
