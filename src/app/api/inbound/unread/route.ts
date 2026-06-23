import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/collections';
import { isUnreadReply } from '@/lib/leads/unread';

// Poll endpoint for the board. Returns one row per lead with an unread
// inbound reply. The board polls this every 30s; new placeIds compared to
// the last-seen set fire a sonner toast.
//
// Keep this projection narrow — the board only needs enough to render a
// toast and route a click. The full reply HTML stays on the detail pane.

export const dynamic = 'force-dynamic';

type UnreadRow = {
  placeId: string;
  businessName: string;
  unreadReplyAt: string;
  lastReadReplyAt: string | null;
  latestReplyFrom: string | null;
  latestReplySubject: string | null;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const db = await getDb();

  // Mongo-side prefilter: only docs with unreadReplyAt set. The strict
  // `read >= reply` check is enforced again on the JS side via isUnreadReply
  // (single source of truth across server + client).
  const states = await db
    .collection(COLLECTIONS.sk_lead_state)
    .find(
      { unreadReplyAt: { $exists: true, $ne: null } },
      { projection: { leadPlaceId: 1, unreadReplyAt: 1, lastReadReplyAt: 1 } },
    )
    .toArray();

  if (states.length === 0) {
    return NextResponse.json({ ok: true, unread: [] as UnreadRow[] });
  }

  const candidates = states.filter((s) =>
    isUnreadReply({
      unreadReplyAt: typeof s.unreadReplyAt === 'string'
        ? s.unreadReplyAt
        : s.unreadReplyAt instanceof Date
          ? s.unreadReplyAt.toISOString()
          : null,
      lastReadReplyAt: typeof s.lastReadReplyAt === 'string'
        ? s.lastReadReplyAt
        : s.lastReadReplyAt instanceof Date
          ? s.lastReadReplyAt.toISOString()
          : null,
    }),
  );

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, unread: [] as UnreadRow[] });
  }

  const placeIds = candidates.map((s) => s.leadPlaceId);

  // Pull business names from the lead source.
  const leads = await db
    .collection(COLLECTIONS.valid_pulse_leads)
    .find(
      { $or: [{ placeId: { $in: placeIds } }, { place_id: { $in: placeIds } }] },
      { projection: { placeId: 1, place_id: 1, name: 1, business: 1 } },
    )
    .toArray();

  const nameByPlaceId = new Map<string, string>();
  for (const l of leads) {
    const id = (l.placeId as string | undefined) ?? (l.place_id as string | undefined);
    if (!id) continue;
    nameByPlaceId.set(id, (l.name as string | undefined) ?? (l.business as string | undefined) ?? 'Unknown');
  }

  // Pull the latest inbound_reply activity per lead — for the toast text.
  const latest = await db
    .collection(COLLECTIONS.sk_activities)
    .aggregate([
      { $match: { leadPlaceId: { $in: placeIds }, type: 'inbound_reply' } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$leadPlaceId',
          payload: { $first: '$payload' },
        },
      },
    ])
    .toArray();
  const latestByPlaceId = new Map<string, { from?: string; subject?: string }>();
  for (const row of latest) {
    latestByPlaceId.set(row._id as string, (row.payload as { from?: string; subject?: string }) ?? {});
  }

  const unread: UnreadRow[] = candidates.map((s) => {
    const placeId = s.leadPlaceId as string;
    const ts = s.unreadReplyAt;
    const lastTs = s.lastReadReplyAt;
    const lat = latestByPlaceId.get(placeId);
    return {
      placeId,
      businessName: nameByPlaceId.get(placeId) ?? 'Unknown',
      unreadReplyAt: ts instanceof Date ? ts.toISOString() : String(ts),
      lastReadReplyAt: !lastTs
        ? null
        : lastTs instanceof Date
          ? lastTs.toISOString()
          : String(lastTs),
      latestReplyFrom: lat?.from ?? null,
      latestReplySubject: lat?.subject ?? null,
    };
  });

  return NextResponse.json({ ok: true, unread });
}
