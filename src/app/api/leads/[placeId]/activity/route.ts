import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { writeActivity } from '@/lib/activities/write';

// After the DISPOSITION block was removed from the lead pane (see goal
// sales-kanban-lead-reminders), the only remaining caller of this route is
// the phone-copy button. We narrow the accepted body so an unauthorized
// caller can't shove arbitrary `disposition` events into the feed via this
// endpoint. The outbound-agent local bridge writes `disposition` activities
// through its own server-side `writeActivity` path, not through this HTTP
// route, so nothing else needs to keep working.
const Body = z.object({
  code: z.literal('phone_viewed'),
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
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  await writeActivity({
    leadPlaceId: placeId,
    sdrEmail: session.user.email,
    sdrName: session.user.name ?? undefined,
    type: 'phone_viewed',
    payload: { code: parsed.data.code },
  });

  return NextResponse.json({ ok: true });
}
