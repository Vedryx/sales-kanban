import 'server-only';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/collections';
import type { GranularStage } from '@/lib/stages';
import { writeActivity } from '@/lib/activities/write';

export async function moveLeadStage(opts: {
  placeId: string;
  to: GranularStage;
  sdrEmail: string;
  sdrName?: string;
}): Promise<{ from: GranularStage; to: GranularStage }> {
  const db = await getDb();
  const col = db.collection(COLLECTIONS.sk_lead_state);
  const existing = await col.findOne({ leadPlaceId: opts.placeId });
  const from: GranularStage = (existing?.stage as GranularStage) ?? 'new';
  const now = new Date();
  await col.updateOne(
    { leadPlaceId: opts.placeId },
    {
      $set: {
        leadPlaceId: opts.placeId,
        stage: opts.to,
        assignedTo: opts.sdrEmail,
        updatedAt: now,
        updatedBy: opts.sdrEmail,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  await writeActivity({
    leadPlaceId: opts.placeId,
    sdrEmail: opts.sdrEmail,
    sdrName: opts.sdrName,
    type: 'stage_move',
    payload: { from, to: opts.to },
  });

  return { from, to: opts.to };
}

export async function patchLeadState(opts: {
  placeId: string;
  sdrEmail: string;
  patch: Partial<{
    nextActionAt: string | null;
    nextActionIntent: string | null;
    lastNote: string | null;
    quote: { amount: number | null; currency: 'USD'; sentAt: string | null };
    deal: { amount: number | null; currency: 'USD'; closedAt: string | null };
    deposit: { amount: number | null; paidAt: string | null };
  }>;
}) {
  const db = await getDb();
  await db.collection(COLLECTIONS.sk_lead_state).updateOne(
    { leadPlaceId: opts.placeId },
    {
      $set: {
        ...opts.patch,
        leadPlaceId: opts.placeId,
        updatedAt: new Date(),
        updatedBy: opts.sdrEmail,
      },
      $setOnInsert: { createdAt: new Date(), stage: 'new' as GranularStage },
    },
    { upsert: true },
  );
}
