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
        vertical: 1,
        pagespeed: 1,
        pagespeedScore: 1,
        pagespeedFlag: 1,
        pagespeedMetrics: 1,
        pagespeedCategories: 1,
        pagespeedField: 1,
        securityGrade: 1,
        website: 1,
        email: 1, // only existence — `hasEmail` derived; we don't render the value on the card
        // Narrow state_data projection — we specifically want the reminder
        // field, the summary array (for `latestMeetingSummary` preview), the
        // legacy `lastNote` + `updatedAt` (for the read-time legacy-note
        // synthesis in leadProjection.ts), and the fields the card already
        // consumed (stage, assignedTo, unread state, pitchEmailSentAt,
        // email override). Excluding the money row from the projection
        // trims a few bytes per card even though the fields are ignored
        // downstream. `nextActionAt` stays because it's the fallback source
        // for `nextReminderAt` on legacy rows.
        'state_data.stage': 1,
        'state_data.assignedTo': 1,
        'state_data.email': 1,
        'state_data.section': 1,
        'state_data.pitchEmailSentAt': 1,
        'state_data.unreadReplyAt': 1,
        'state_data.lastReadReplyAt': 1,
        'state_data.nextReminderAt': 1,
        'state_data.nextActionAt': 1,
        'state_data.lastNote': 1,
        'state_data.meetingSummaries': 1,
        'state_data.updatedAt': 1,
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
