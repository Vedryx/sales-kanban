import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { patchLeadState } from '@/lib/leads/write';

// Idempotent. Sets sk_lead_state.lastReadReplyAt = now so the unread badge
// disappears. Called by LeadDetailPane on open. No body required.

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { placeId } = await params;
  const nowIso = new Date().toISOString();
  await patchLeadState({
    placeId,
    sdrEmail: session.user.email,
    patch: { lastReadReplyAt: nowIso },
  });
  return NextResponse.json({ ok: true, lastReadReplyAt: nowIso });
}
