import { google, calendar_v3 } from 'googleapis';
import { isPreview } from '@/lib/env';

function client(accessToken: string) {
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth });
}

export type InsertEventInput = {
  accessToken: string;
  title: string;
  startISO: string;
  endISO: string;
  timezone: string;
  attendeeEmails: string[];
  agenda: string | null;
  meetingType: 'gmeet' | 'phone' | 'inperson';
  inPersonAddress?: string | null;
};

export async function createCalendarEvent(input: InsertEventInput): Promise<{
  eventId: string;
  calendarId: string;
  meetLink: string | null;
  htmlLink: string | null;
}> {
  const cal = client(input.accessToken);
  const calendarId = 'primary';
  const previewTitle = isPreview ? `[PREVIEW] ${input.title}` : input.title;
  const sendUpdates = isPreview ? 'none' : 'all';

  const requestBody: calendar_v3.Schema$Event = {
    summary: previewTitle,
    description: input.agenda ?? undefined,
    start: { dateTime: input.startISO, timeZone: input.timezone },
    end: { dateTime: input.endISO, timeZone: input.timezone },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    location:
      input.meetingType === 'inperson' && input.inPersonAddress
        ? input.inPersonAddress
        : undefined,
  };

  if (input.meetingType === 'gmeet') {
    requestBody.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const res = await cal.events.insert({
    calendarId,
    conferenceDataVersion: input.meetingType === 'gmeet' ? 1 : 0,
    sendUpdates,
    requestBody,
  });

  return {
    eventId: res.data.id!,
    calendarId,
    meetLink: res.data.hangoutLink ?? null,
    htmlLink: res.data.htmlLink ?? null,
  };
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId = 'primary',
) {
  const cal = client(accessToken);
  await cal.events.delete({
    calendarId,
    eventId,
    sendUpdates: isPreview ? 'none' : 'all',
  });
}
