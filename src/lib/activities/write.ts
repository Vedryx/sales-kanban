import 'server-only';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/collections';
import type { Activity, ActivityType } from '@/types/activity';

export async function writeActivity(opts: {
  leadPlaceId: string;
  sdrEmail: string;
  sdrName?: string;
  type: ActivityType;
  payload?: Record<string, unknown>;
  isSystem?: boolean;
}) {
  const db = await getDb();
  await db.collection(COLLECTIONS.sk_activities).insertOne({
    leadPlaceId: opts.leadPlaceId,
    sdrEmail: opts.sdrEmail,
    sdrName: opts.sdrName,
    type: opts.type,
    payload: opts.payload ?? {},
    createdAt: new Date(),
    isSystem: opts.isSystem ?? false,
  });
}

export async function listActivities(placeId: string, limit = 100): Promise<Activity[]> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTIONS.sk_activities)
    .find({ leadPlaceId: placeId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({
    _id: d._id?.toString(),
    leadPlaceId: d.leadPlaceId,
    sdrEmail: d.sdrEmail,
    sdrName: d.sdrName,
    type: d.type,
    payload: d.payload,
    createdAt: new Date(d.createdAt).toISOString(),
    isSystem: d.isSystem,
  }));
}
