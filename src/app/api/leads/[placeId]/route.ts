import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getLeadDetail } from '@/lib/leads/read';
import { listActivities } from '@/lib/activities/write';
import { listFutureMeetingsForLead } from '@/lib/meetings/service';
import { deleteLead } from '@/lib/leads/write';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const { placeId } = await params;

  const [lead, activities, futureMeetings] = await Promise.all([
    getLeadDetail(placeId),
    listActivities(placeId),
    listFutureMeetingsForLead(placeId),
  ]);
  if (!lead) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    lead,
    activities,
    futureMeetings: futureMeetings.length,
  });
}

// Hard-delete the lead + cascade across sk_lead_state, sk_activities,
// sk_meetings. Same auth gate as GET. No confirmation server-side — the
// destructive-confirm dialog lives in LeadDetailPane (front-of-house). We
// return 200 + counts even when nothing was matched (idempotent) so the
// caller can distinguish "actually deleted N docs" from network errors.
// A 404 was considered but rejected — callers only invoke this after the
// user confirms on the pane, at which point the lead demonstrably exists;
// treating a zero-match as a network error obscures a real "already gone"
// signal (e.g. a second browser tab already deleted it).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const { placeId } = await params;
  const deleted = await deleteLead(placeId);
  return NextResponse.json({ ok: true, deleted });
}
