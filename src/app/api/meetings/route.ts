import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../auth';
import { bookMeeting } from '@/lib/meetings/service';

const Body = z.object({
  leadPlaceId: z.string().min(1),
  leadBusinessName: z.string().min(1),
  leadEmail: z.string().email().nullable().optional(),
  title: z.string().min(1),
  startISO: z.string().min(1),
  durationMin: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  timezone: z.string().min(1),
  attendeeEmails: z.array(z.string().email()).min(1),
  meetingType: z.enum(['gmeet', 'phone', 'inperson']),
  inPersonAddress: z.string().nullable().optional(),
  agenda: z.string().nullable().optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  if (!session.accessToken) {
    return NextResponse.json(
      { ok: false, message: 'Google access token missing — re-sign-in.' },
      { status: 403 },
    );
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.flatten().formErrors.join('; ') },
      { status: 400 },
    );
  }
  const res = await bookMeeting({
    accessToken: session.accessToken,
    sdrEmail: session.user.email,
    sdrName: session.user.name ?? undefined,
    ...parsed.data,
    leadEmail: parsed.data.leadEmail ?? null,
  });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, message: res.message, reason: res.reason },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    meeting: res.meeting,
    meetLink: res.meetLink,
    htmlLink: res.htmlLink,
  });
}
