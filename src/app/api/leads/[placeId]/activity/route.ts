import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { writeActivity } from '@/lib/activities/write';
import { moveLeadStage, patchLeadState } from '@/lib/leads/write';
import type { GranularStage } from '@/lib/stages';

const Body = z.object({
  code: z.string(),
  intent: z.string().optional(),
  advanceTo: z
    .enum([
      'new',
      'dialing',
      'connected',
      'demo_booked',
      'quote_sent',
      'verbal_yes',
      'closed_won',
      'closed_lost',
      'closed_dnc',
    ])
    .optional(),
});

// Auto-schedule deltas in minutes
const SCHEDULE_DELTA: Record<string, number> = {
  no_answer: 120,
  busy: 30,
  voicemail: 1440,
};

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const { placeId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const { code, intent, advanceTo } = parsed.data;

  await writeActivity({
    leadPlaceId: placeId,
    sdrEmail: session.user.email,
    sdrName: session.user.name ?? undefined,
    type: code === 'phone_viewed' ? 'phone_viewed' : 'disposition',
    payload: { code, intent },
  });

  const delta = SCHEDULE_DELTA[code];
  if (delta) {
    const next = new Date(Date.now() + delta * 60_000).toISOString();
    await patchLeadState({
      placeId,
      sdrEmail: session.user.email,
      patch: { nextActionAt: next, nextActionIntent: intent ?? null },
    });
  }

  if (advanceTo) {
    await moveLeadStage({
      placeId,
      to: advanceTo as GranularStage,
      sdrEmail: session.user.email,
      sdrName: session.user.name ?? undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
