import 'server-only';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/collections';
import { toCard, toDetail, type RawLeadDoc } from '@/lib/leadProjection';
import type { LeadCard, LeadDetail } from '@/types/lead';

// Reads valid_pulse_leads + sk_lead_state in one aggregate.
// Phone is NEVER projected here — only in getLeadDetail.
export async function getBoardLeads(): Promise<LeadCard[]> {
  const db = await getDb();
  const pipeline = [
    {
      $lookup: {
        from: COLLECTIONS.sk_lead_state,
        localField: 'placeId',
        foreignField: 'leadPlaceId',
        as: 'lead_state',
      },
    },
    { $addFields: { state_data: { $arrayElemAt: ['$lead_state', 0] } } },
    {
      $project: {
        _id: 0,
        placeId: 1,
        place_id: 1,
        name: 1,
        business: 1,
        city: 1,
        state: 1,
        pagespeed: 1,
        pagespeedScore: 1,
        pagespeedFlag: 1,
        website: 1,
        email: 1, // only existence — `hasEmail` derived; we don't render the value on the card
        state_data: 1,
      },
    },
  ];

  try {
    const docs = (await db
      .collection(COLLECTIONS.valid_pulse_leads)
      .aggregate(pipeline)
      .toArray()) as RawLeadDoc[];
    return docs.map(toCard);
  } catch {
    // Collection missing (preview source empty). Render empty board, not 500.
    return [];
  }
}

export async function getLeadDetail(placeId: string): Promise<LeadDetail | null> {
  const db = await getDb();
  try {
    const doc = (await db.collection(COLLECTIONS.valid_pulse_leads).aggregate([
      { $match: { $or: [{ placeId }, { place_id: placeId }] } },
      {
        $lookup: {
          from: COLLECTIONS.sk_lead_state,
          localField: 'placeId',
          foreignField: 'leadPlaceId',
          as: 'lead_state',
        },
      },
      { $addFields: { state_data: { $arrayElemAt: ['$lead_state', 0] } } },
      { $limit: 1 },
    ]).next()) as RawLeadDoc | null;
    if (!doc) return null;
    return toDetail(doc);
  } catch {
    return null;
  }
}
