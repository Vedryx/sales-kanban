#!/usr/bin/env node
// Backfill PageSpeed (4-category + CrUX) + Mozilla Observatory security grade
// onto leads in `valid_pulse_leads` that were captured before the v2 inline
// scorecard work (PR #11) and therefore have no `pagespeedCategories` field.
//
// Standalone — does NOT boot Next.js. Uses the same esbuild-bundle trick the
// send-test-email.mjs script uses, but bundles the three production modules
// the route handler uses in its after() block: runPagespeed, runObservatory,
// patchLeadPagespeed/patchLeadSecurity. The `server-only` sentinel import is
// aliased to a no-op shim so the modules bundle cleanly in a Node context.
//
// Usage:
//   # DRY-RUN — print candidates, no writes
//   MONGODB_URI=... PAGESPEED_API_KEY=... node scripts/backfill-scorecard.mjs
//
//   # Actually re-score and patch (cap to first N for safety)
//   MONGODB_URI=... PAGESPEED_API_KEY=... node scripts/backfill-scorecard.mjs --apply --limit=10
//
//   # All options
//   --apply           Perform writes (default is dry-run)
//   --run             Alias for --apply
//   --limit=N         Cap how many leads to process (default: no cap in dry-run; 50 in apply)
//   --concurrency=N   Parallel PSI+Observatory pairs (default: 3 — PSI is slow but be polite)
//
// Required env:
//   MONGODB_URI       MongoDB connection string
// Optional env:
//   MONGODB_DB        DB name (defaults to "vedryx" via the bundled mongo helper)
//   PAGESPEED_API_KEY Google PageSpeed key (recommended; keyless quota is tiny)
//   PREVIEW_MODE      "true" → reads/writes `valid_pulse_leads_preview` (mirrors prod helper)
//
// Safety:
//   - Writes are additive ($set only) — never deletes existing fields. The
//     bundled patchLeadPagespeed / patchLeadSecurity only $set their own keys,
//     so leads that already have partial data (e.g. CrUX missing because the
//     domain has low traffic) keep whatever was previously stored.
//   - One lead failing never aborts the run.
//   - Dry-run is default; apply must be opted-into.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith('--')) out[a.slice(2)] = true;
  }
  return out;
}

const args = parseArgs();
const apply = !!(args.apply || args.run);
const limit = args.limit ? Number.parseInt(args.limit, 10) : (apply ? 50 : Infinity);
const concurrency = Math.max(1, Number.parseInt(args.concurrency || '3', 10));

if (!process.env.MONGODB_URI) {
  console.error('Required env: MONGODB_URI');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bundle the three production modules into a single ESM file so this script
// can import them without booting Next.js. `server-only` is aliased to a
// no-op shim (see scripts/_shims/empty.mjs).
// ---------------------------------------------------------------------------
async function compileBundle() {
  // We bundle a tiny entry file that re-exports just the symbols this script
  // needs. Keeps the bundle scope small + the imports explicit. The entry
  // file lives at `<root>/tmp/_backfill_entry.mjs` so it can use the `@/...`
  // alias (mapped to src/) just like the real Next.js modules.
  const entryContents = `
    export { runPagespeed } from '@/lib/pagespeed/run';
    export { runObservatory } from '@/lib/observatory/run';
    export { patchLeadPagespeed, patchLeadSecurity } from '@/lib/leads/write';
    export { COLLECTIONS } from '@/lib/collections';
    export { getDb } from '@/lib/mongo';
  `;
  const tmpDir = resolve(root, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const entryPath = join(tmpDir, '_backfill_entry.mjs');
  await writeFile(entryPath, entryContents, 'utf8');

  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    alias: {
      'server-only': resolve(root, 'scripts/_shims/empty.mjs'),
      '@': resolve(root, 'src'),
    },
    // Mongo + Node built-ins should resolve from this script's node_modules.
    external: ['mongodb', 'crypto', 'node:*'],
    loader: { '.ts': 'ts' },
  });
  return result.outputFiles[0].text;
}

async function loadBundle() {
  const bundle = await compileBundle();
  const tmpDir = resolve(root, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const compiledPath = join(tmpDir, '_backfill_compiled.mjs');
  await writeFile(compiledPath, bundle, 'utf8');
  return import(pathToFileURL(compiledPath).href);
}

// ---------------------------------------------------------------------------
// Concurrency helper — process an array in fixed-N parallel slots.
// ---------------------------------------------------------------------------
async function processWithConcurrency(items, n, fn) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      try {
        const r = await fn(item, idx);
        results[idx] = { ok: true, value: r };
      } catch (err) {
        results[idx] = { ok: false, error: err };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Mode: ${apply ? 'APPLY (writes ON)' : 'DRY-RUN (no writes)'}`);
  console.log(`Limit: ${Number.isFinite(limit) ? limit : 'none'}   Concurrency: ${concurrency}`);
  console.log('Compiling production modules…');

  const mod = await loadBundle();
  const { runPagespeed, runObservatory, patchLeadPagespeed, patchLeadSecurity, COLLECTIONS, getDb } = mod;

  const db = await getDb();
  const col = db.collection(COLLECTIONS.valid_pulse_leads);

  // Candidate filter: website present + pagespeedCategories missing.
  // The brief notes securityGrade-missing as a secondary trigger, but the
  // primary signal is pagespeedCategories absence — we backfill BOTH PSI +
  // Observatory in one pass for every candidate, so the union doesn't add
  // value. (If the lead already has categories but not securityGrade, the
  // route's after() block will pick it up next time it's manually re-added,
  // and a future pass can be written if needed.)
  const filter = {
    website: { $type: 'string', $ne: '' },
    pagespeedCategories: { $exists: false },
  };

  const total = await col.countDocuments(filter);
  console.log(`[${total} candidates] (website set + pagespeedCategories missing)`);

  // For dry-run preview we cap the printed list at 100 rows but always print
  // the total count above.
  const previewCap = 100;
  const cursor = col
    .find(filter, {
      projection: { placeId: 1, name: 1, business: 1, website: 1, pagespeed: 1, pagespeedScore: 1, securityGrade: 1 },
    })
    .limit(Number.isFinite(limit) ? limit : 10_000);

  const candidates = [];
  for await (const doc of cursor) {
    candidates.push(doc);
  }
  console.log(`Will process: ${candidates.length}`);

  if (!apply) {
    console.log('--- preview (max 100 rows) ---');
    candidates.slice(0, previewCap).forEach((d) => {
      const score = d.pagespeedScore ?? d.pagespeed ?? '—';
      const name = d.name ?? d.business ?? '(unnamed)';
      console.log(`  ${d.placeId} | ${name} | ${d.website} | score=${score}`);
    });
    console.log('done. dry-run');
    await closeMongo();
    return;
  }

  // Apply path — re-score each candidate.
  let ok = 0;
  let failed = 0;
  let skippedNoWebsite = 0;

  await processWithConcurrency(candidates, concurrency, async (doc) => {
    const website = doc.website;
    if (!website || typeof website !== 'string' || website.trim() === '') {
      skippedNoWebsite++;
      console.log(`[skip ${doc.placeId} reason=no_website]`);
      return;
    }

    // Mirror the route's after() block exactly: parallel allSettled, persist
    // each independently, never let one failure abort the other.
    const [psiResult, obsResult] = await Promise.allSettled([
      runPagespeed(website),
      runObservatory(website),
    ]);

    let scoreLog = '—';
    let gradeLog = '—';

    if (psiResult.status === 'fulfilled') {
      try {
        await patchLeadPagespeed({ placeId: doc.placeId, ...psiResult.value });
        scoreLog = String(psiResult.value.score);
      } catch (err) {
        console.warn(`[psi-persist-fail ${doc.placeId} ${err?.message ?? err}]`);
      }
    } else {
      console.warn(`[psi-fail ${doc.placeId} ${psiResult.reason?.message ?? psiResult.reason}]`);
    }

    if (obsResult.status === 'fulfilled' && obsResult.value) {
      try {
        await patchLeadSecurity({
          placeId: doc.placeId,
          grade: obsResult.value.grade,
          score: obsResult.value.score,
        });
        gradeLog = obsResult.value.grade;
      } catch (err) {
        console.warn(`[obs-persist-fail ${doc.placeId} ${err?.message ?? err}]`);
      }
    }

    // A lead counts as "ok" if EITHER PSI or Observatory produced something
    // persistable. PSI completely failing AND Observatory returning null is a
    // failure for our backfill purposes (we wrote nothing).
    if (scoreLog !== '—' || gradeLog !== '—') {
      ok++;
      console.log(`[ok ${doc.placeId} score=${scoreLog} grade=${gradeLog}]`);
    } else {
      failed++;
      console.log(`[fail ${doc.placeId} no_data_persisted]`);
    }
  });

  console.log(
    `processed=${candidates.length} ok=${ok} failed=${failed} skipped_no_website=${skippedNoWebsite}`,
  );
  console.log(`done. wrote ${ok}`);
  await closeMongo();
}

// Mongo client used by the bundled getDb() lives on globalThis. Close it so
// the script can exit cleanly.
async function closeMongo() {
  try {
    const client = globalThis.__mongoClient;
    if (client && typeof client.close === 'function') {
      await client.close();
    }
  } catch {
    // best-effort
  }
}

main().catch((err) => {
  console.error(err);
  closeMongo().finally(() => process.exit(1));
});
