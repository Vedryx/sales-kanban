import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { moveLeadStage } from '@/lib/leads/write';
import type { GranularStage } from '@/lib/stages';

const Body = z.object({
  stage: z.enum([
    'new',
    'dialing',
    'connected',
    'demo_booked',
    'quote_sent',
    'verbal_yes',
    'closed_won',
    'closed_lost',
    'closed_dnc',
  ]),
});

export const dynamic = 'force-dynamic';

export async function PATCH(
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
  const res = await moveLeadStage({
    placeId,
    to: parsed.data.stage as GranularStage,
    sdrEmail: session.user.email,
    sdrName: session.user.name ?? undefined,
  });
  return NextResponse.json({ ok: true, ...res });
}
