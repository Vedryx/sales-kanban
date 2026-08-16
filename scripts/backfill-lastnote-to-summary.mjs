// Backfill retired `sk_lead_state.lastNote` into `sk_lead_state.meetingSummaries[]`.
//
// Ships alongside the "sales-kanban-lead-reminders" iteration that promoted
// meeting summaries to the primary block in the lead pane and retired the
// Notes textarea. Existing lastNote values must not vanish — this script
// imports each into the summaries array as a synthetic entry with a stable
// sentinel id/by (`legacy-note`) so the pane can differentiate it visually,
// and then clears the lastNote field so subsequent reads don't double-count.
//
// Idempotent: safe to run twice. Only touches docs that
//   (a) have a non-empty `lastNote` and
//   (b) don't already have a summary entry with `by: 'legacy-note'`.
//
// Usage:
//   MONGODB_URI=... MONGODB_DB=vedryx [PREVIEW_MODE=true] node scripts/backfill-lastnote-to-summary.mjs
//
// Dry-run (no writes, just count):
//   DRY_RUN=true MONGODB_URI=... MONGODB_DB=vedryx node scripts/backfill-lastnote-to-summary.mjs
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'vedryx';
const isPreview = process.env.PREVIEW_MODE === 'true';
const dryRun = process.env.DRY_RUN === 'true';
const collName = isPreview ? 'sk_lead_state_preview' : 'sk_lead_state';

if (!uri) {
  console.error('MONGODB_URI required');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const col = client.db(dbName).collection(collName);

    // Candidate docs: lastNote is a non-empty string AND the summaries array
    // doesn't already contain a legacy-note import. Match uses a $expr so we
    // can compose both predicates without an intermediate aggregation.
    const filter = {
      lastNote: { $type: 'string', $ne: '' },
      $or: [
        { meetingSummaries: { $exists: false } },
        { meetingSummaries: { $eq: [] } },
        { meetingSummaries: { $not: { $elemMatch: { by: 'legacy-note' } } } },
      ],
    };

    const total = await col.countDocuments(filter);
    console.log(`[backfill] collection=${collName} candidates=${total} dryRun=${dryRun}`);
    if (total === 0) {
      console.log('[backfill] nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('[backfill] DRY_RUN — no writes.');
      return;
    }

    const cursor = col.find(filter, {
      projection: { _id: 1, leadPlaceId: 1, lastNote: 1, updatedAt: 1 },
    });

    let updated = 0;
    let skipped = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) break;
      const text = String(doc.lastNote ?? '').trim();
      if (!text) {
        skipped += 1;
        continue;
      }
      const at =
        doc.updatedAt instanceof Date
          ? doc.updatedAt.toISOString()
          : typeof doc.updatedAt === 'string'
            ? doc.updatedAt
            : new Date(0).toISOString();
      const summary = {
        id: `legacy-${randomUUID()}`,
        text,
        at,
        by: 'legacy-note',
      };
      const res = await col.updateOne(
        {
          _id: doc._id,
          lastNote: { $type: 'string', $ne: '' },
          $or: [
            { meetingSummaries: { $exists: false } },
            { meetingSummaries: { $eq: [] } },
            { meetingSummaries: { $not: { $elemMatch: { by: 'legacy-note' } } } },
          ],
        },
        {
          $push: { meetingSummaries: summary },
          $set: { lastNote: null, updatedAt: new Date() },
        },
      );
      if (res.modifiedCount === 1) updated += 1;
      else skipped += 1;
    }
    console.log(`[backfill] updated=${updated} skipped=${skipped}`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
