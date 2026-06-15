import 'server-only';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/collections';
import { isPreview } from '@/lib/env';
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google/calendar';
import { writeActivity } from '@/lib/activities/write';
import type { Meeting, MeetingType } from '@/types/meeting';
import { safeLog } from '@/lib/privacy';

export type BookMeetingInput = {
  accessToken: string;
  sdrEmail: string;
  sdrName?: string;
  leadPlaceId: string;
  leadBusinessName: string;
  leadEmail?: string | null;
  title: string;
  startISO: string;
  durationMin: 15 | 30 | 45 | 60;
  timezone: string;
  attendeeEmails: string[];
  meetingType: MeetingType;
  inPersonAddress?: string | null;
  agenda?: string | null;
};

export type BookResult =
  | { ok: true; meeting: Meeting; meetLink: string | null; htmlLink: string | null }
  | { ok: false; reason: 'google_error' | 'mongo_error'; message: string };

export async function bookMeeting(input: BookMeetingInput): Promise<BookResult> {
  const start = new Date(input.startISO);
  const end = new Date(start.getTime() + input.durationMin * 60_000);

  let googleResult: Awaited<ReturnType<typeof createCalendarEvent>> | null = null;
  if (input.meetingType === 'gmeet' || input.meetingType === 'inperson') {
    try {
      googleResult = await createCalendarEvent({
        accessToken: input.accessToken,
        title: input.title,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        timezone: input.timezone,
        attendeeEmails: input.attendeeEmails,
        agenda: input.agenda ?? null,
        meetingType: input.meetingType,
        inPersonAddress: input.inPersonAddress ?? null,
      });
    } catch (err) {
      safeLog.error('google_event_insert_failed', { msg: String(err) });
      return { ok: false, reason: 'google_error', message: String(err) };
    }
  }

  const meetingDoc: Meeting = {
    leadPlaceId: input.leadPlaceId,
    leadBusinessName: input.leadBusinessName,
    sdrEmail: input.sdrEmail,
    title: isPreview ? `[PREVIEW] ${input.title}` : input.title,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    timezone: input.timezone,
    durationMin: input.durationMin,
    attendeeEmails: input.attendeeEmails,
    meetingUrl: googleResult?.meetLink ?? null,
    inPersonAddress: input.inPersonAddress ?? null,
    meetingType: input.meetingType,
    agenda: input.agenda ?? null,
    status: 'scheduled',
    googleEventId: googleResult?.eventId ?? null,
    googleCalendarId: googleResult?.calendarId ?? null,
    leadEmailSent: !!input.leadEmail && !isPreview,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const db = await getDb();
    // Strip optional string _id (Mongo will assign ObjectId)
    const { _id: _ignored, ...docForInsert } = meetingDoc;
    void _ignored;
    const res = await db.collection(COLLECTIONS.sk_meetings).insertOne(docForInsert);
    meetingDoc._id = res.insertedId.toString();
  } catch (err) {
    safeLog.error('meeting_mongo_insert_failed', { msg: String(err) });
    // Best-effort rollback on Google side
    if (googleResult) {
      try {
        await deleteCalendarEvent(input.accessToken, googleResult.eventId);
      } catch {
        /* swallow — already alerting */
      }
    }
    return { ok: false, reason: 'mongo_error', message: String(err) };
  }

  await writeActivity({
    leadPlaceId: input.leadPlaceId,
    sdrEmail: input.sdrEmail,
    sdrName: input.sdrName,
    type: 'meeting_booked',
    payload: {
      meetingId: meetingDoc._id,
      title: meetingDoc.title,
      startAt: meetingDoc.startAt,
      meetingType: meetingDoc.meetingType,
    },
  });

  return {
    ok: true,
    meeting: meetingDoc,
    meetLink: googleResult?.meetLink ?? null,
    htmlLink: googleResult?.htmlLink ?? null,
  };
}

export async function listMeetingsToday(sdrEmail: string, tz = 'UTC'): Promise<Meeting[]> {
  const db = await getDb();
  const now = new Date();
  // Start/end of today in SDR tz — naive: use local midnight on server.
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  // tz unused server-side here; UI handles render.
  void tz;

  const docs = await db
    .collection(COLLECTIONS.sk_meetings)
    .find({
      sdrEmail,
      startAt: { $gte: startOfDay.toISOString(), $lt: endOfDay.toISOString() },
    })
    .sort({ startAt: 1 })
    .toArray();

  return docs.map((d) => ({
    ...(d as unknown as Meeting),
    _id: d._id?.toString(),
  }));
}

export async function listMeetingsTomorrow(sdrEmail: string): Promise<Meeting[]> {
  const db = await getDb();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const docs = await db
    .collection(COLLECTIONS.sk_meetings)
    .find({
      sdrEmail,
      startAt: { $gte: start.toISOString(), $lt: end.toISOString() },
    })
    .sort({ startAt: 1 })
    .toArray();
  return docs.map((d) => ({ ...(d as unknown as Meeting), _id: d._id?.toString() }));
}

export async function listFutureMeetingsForLead(placeId: string): Promise<Meeting[]> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTIONS.sk_meetings)
    .find({
      leadPlaceId: placeId,
      startAt: { $gte: new Date().toISOString() },
      status: 'scheduled',
    })
    .sort({ startAt: 1 })
    .toArray();
  return docs.map((d) => ({ ...(d as unknown as Meeting), _id: d._id?.toString() }));
}
