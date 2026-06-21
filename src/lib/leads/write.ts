import 'server-only';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/collections';
import { toCard, type RawLeadDoc } from '@/lib/leadProjection';
import type { LeadCard } from '@/types/lead';
import type { GranularStage } from '@/lib/stages';
import { writeActivity } from '@/lib/activities/write';

// Manually-added lead. Inserts a base doc into valid_pulse_leads (the same
// collection the scraper feeds) so the existing board read/join works unchanged.
// placeId is prefixed `manual:` + a UUID so it can never collide with a Google
// place_id and the scraper cron will never overwrite it.
export async function createManualLead(opts: {
  businessName: string;
  website: string;
  email: string;
  city?: string;
  state?: string;
  phone?: string;
  ownerName?: string;
  sdrEmail: string;
  sdrName?: string;
}): Promise<LeadCard> {
  const db = await getDb();
  const now = new Date();
  const placeId = `manual:${randomUUID()}`;

  const doc: RawLeadDoc & { source: string; createdAt: Date; createdBy: string } = {
    placeId,
    name: opts.businessName,
    website: opts.website,
    email: opts.email,
    city: opts.city,
    state: opts.state,
    phone: opts.phone,
    ownerName: opts.ownerName,
    source: 'manual',
    createdAt: now,
    createdBy: opts.sdrEmail,
  };

  await db.collection(COLLECTIONS.valid_pulse_leads).insertOne(doc);

  await writeActivity({
    leadPlaceId: placeId,
    sdrEmail: opts.sdrEmail,
    sdrName: opts.sdrName,
    type: 'lead_created',
    payload: { businessName: opts.businessName, website: opts.website, source: 'manual' },
  });

  return toCard(doc);
}

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

type MoneyFieldName = 'quote' | 'deal' | 'deposit';

export async function patchLeadMoney(opts: {
  placeId: string;
  sdrEmail: string;
  field: MoneyFieldName;
  amount: number | null;
}) {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  let setBlock: Record<string, unknown>;
  if (opts.field === 'quote') {
    setBlock = {
      quote: { amount: opts.amount, currency: 'USD' as const, sentAt: opts.amount != null ? nowIso : null },
    };
  } else if (opts.field === 'deal') {
    setBlock = {
      deal: { amount: opts.amount, currency: 'USD' as const, closedAt: opts.amount != null ? nowIso : null },
    };
  } else {
    setBlock = {
      deposit: { amount: opts.amount, paidAt: opts.amount != null ? nowIso : null },
    };
  }

  await db.collection(COLLECTIONS.sk_lead_state).updateOne(
    { leadPlaceId: opts.placeId },
    {
      $set: {
        ...setBlock,
        leadPlaceId: opts.placeId,
        updatedAt: now,
        updatedBy: opts.sdrEmail,
      },
      $setOnInsert: { createdAt: now, stage: 'new' as GranularStage },
    },
    { upsert: true },
  );

  await writeActivity({
    leadPlaceId: opts.placeId,
    sdrEmail: opts.sdrEmail,
    type: 'money_update',
    payload: { field: opts.field, amount: opts.amount },
  });
}

export async function patchLeadState(opts: {
  placeId: string;
  sdrEmail: string;
  patch: Partial<{
    nextActionAt: string | null;
    nextActionIntent: string | null;
    lastNote: string | null;
    email: string | null;
    pitchEmailSentAt: string | null;
    pitchEmailLastError: string | null;
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
