import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { appendMeetingSummary } from '@/lib/leads/write';

// Append a meeting summary onto the lead. Same auth gate + zod-guard
// pattern as the sibling routes. 2000-char cap picked to keep the doc
// small; SDRs typing longer notes should be sending them somewhere else.
const Body = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const { placeId } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'bad_request', message: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const summary = await appendMeetingSummary({
    placeId,
    text: parsed.data.text,
    sdrEmail: session.user.email,
    sdrName: session.user.name ?? undefined,
  });

  return NextResponse.json({ ok: true, summary });
}
