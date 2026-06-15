// Idempotent index + collection bootstrap. Run once per environment.
// Usage:
//   MONGODB_URI=... MONGODB_DB=vedryx PREVIEW_MODE=true node scripts/init-mongo.mjs
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'vedryx';
const isPreview = process.env.PREVIEW_MODE === 'true';
const suffix = (n) => (isPreview ? `${n}_preview` : n);

if (!uri) {
  console.error('MONGODB_URI required');
  process.exit(1);
}

const COLLS = ['sk_users', 'sk_meetings', 'sk_activities', 'sk_lead_state'].map(suffix);

const INDEXES = {
  [suffix('sk_users')]: [
    { keys: { email: 1 }, options: { unique: true } },
  ],
  [suffix('sk_meetings')]: [
    { keys: { sdrEmail: 1, startAt: 1 } },
    { keys: { leadPlaceId: 1, createdAt: -1 } },
    { keys: { googleEventId: 1 }, options: { unique: true, sparse: true } },
  ],
  [suffix('sk_activities')]: [
    { keys: { leadPlaceId: 1, createdAt: -1 } },
  ],
  [suffix('sk_lead_state')]: [
    { keys: { leadPlaceId: 1 }, options: { unique: true } },
    { keys: { stage: 1, nextActionAt: 1 } },
    { keys: { assignedTo: 1, nextActionAt: 1 } },
  ],
};

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  for (const c of COLLS) {
    if (!existing.includes(c)) {
      await db.createCollection(c);
      console.log('+ collection', c);
    }
    for (const idx of INDEXES[c] ?? []) {
      const name = await db.collection(c).createIndex(idx.keys, idx.options);
      console.log('  index', c, name, JSON.stringify(idx.keys));
    }
  }
  await client.close();
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
