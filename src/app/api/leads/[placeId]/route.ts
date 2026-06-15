import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getLeadDetail } from '@/lib/leads/read';
import { listActivities } from '@/lib/activities/write';
import { listFutureMeetingsForLead } from '@/lib/meetings/service';

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
