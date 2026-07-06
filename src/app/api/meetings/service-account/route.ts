import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bookMeeting } from '@/lib/meetings/service';
import {
  isServiceAccountEnabled,
  mintServiceAccountAccessToken,
  DEFAULT_IMPERSONATE_SUBJECT,
} from '@/lib/google/serviceAccount';

// Headless meeting-booking endpoint for the outbound voice agent.
//
// Semantics vs the interactive /api/meetings route:
//   - No auth() / NextAuth session — the caller is a server (Dograh via the
//     local bridge), not a browser.
//   - Auth is a shared bearer header: `x-bridge-token: <BRIDGE_SHARED_TOKEN>`.
//   - Feature-flagged: returns 503 unless GOOGLE_SA_ENABLED === 'true'.
//     Keeps the code path OFF until Workspace super-admin has authorised the
//     service account and the founder has flipped the env var.
//   - Token source = service-account JWT with domain-wide delegation,
//     impersonating GOOGLE_SA_IMPERSONATE_SUBJECT (default sales@vedryxtech.com).
//     Falls through to the same bookMeeting() as the interactive route so
//     Google-side + Mongo-side behaviour stays in lock-step.
//
// The existing /api/meetings route is not touched — this is additive.

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
  // Feature flag — hard 503 when disabled so accidental deploys are inert.
  if (!isServiceAccountEnabled()) {
    return NextResponse.json(
      { ok: false, message: 'service-account path disabled' },
      { status: 503 },
    );
  }

  // Shared-secret auth. Constant-time comparison isn't warranted here
  // (both sides local, no timing oracle) but we still fail closed on any
  // missing / mismatched header.
  const expected = process.env.BRIDGE_SHARED_TOKEN;
  const supplied = req.headers.get('x-bridge-token');
  if (!expected || !supplied || expected !== supplied) {
    return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.flatten().formErrors.join('; ') || 'bad body' },
      { status: 400 },
    );
  }

  const subject =
    process.env.GOOGLE_SA_IMPERSONATE_SUBJECT || DEFAULT_IMPERSONATE_SUBJECT;

  let accessToken: string;
  try {
    accessToken = await mintServiceAccountAccessToken({ subject });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: `service-account mint failed: ${String((err as Error).message ?? err)}` },
      { status: 500 },
    );
  }

  const res = await bookMeeting({
    accessToken,
    // sdrEmail attribution → the impersonated subject so activity + meeting
    // rows show the SDR account, not "voice-agent@vedryx.local".
    sdrEmail: subject,
    sdrName: 'Vedryx Voice Agent',
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
