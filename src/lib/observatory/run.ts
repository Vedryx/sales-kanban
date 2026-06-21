import 'server-only';

// Mozilla HTTP Observatory v2 — free HTTP-header security scanner. No API key.
// Used to surface a security letter grade in the inline scorecard.
//
// We treat it as best-effort: every failure path (timeout, non-200, malformed
// JSON, unscannable host, network error) returns null so the scorecard simply
// omits the security row. Never blocks the lead add or email send.
//
// API docs (MDN may lag the live API — verify the actual response shape on
// first call, types here reflect what the v2 endpoint actually returns):
//   POST https://observatory-api.mdn.mozilla.net/api/v2/analyze?host={host}
//        kicks off a scan; the same endpoint returns the latest cached result
//        if one exists within the freshness window.

export type ObservatoryResult = {
  grade: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';
  score: number; // 0-135ish in v2 (can exceed 100 with bonus pts)
};

const ANALYZE_ENDPOINT = 'https://observatory-api.mdn.mozilla.net/api/v2/analyze';
const TIMEOUT_MS = 10_000;

// Permissive shape — we destructure defensively. v2 returns at minimum a
// `grade` and `score` on a successful analyze response; other fields ignored.
type ObservatoryAnalyzeResponse = {
  grade?: unknown;
  score?: unknown;
  // Some v2 responses nest under `scan` — handled defensively.
  scan?: { grade?: unknown; score?: unknown };
};

const VALID_GRADES = new Set<ObservatoryResult['grade']>([
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F',
]);

function extractHost(website: string): string | null {
  try {
    const u = new URL(website);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname || null;
  } catch {
    return null;
  }
}

function coerceGrade(v: unknown): ObservatoryResult['grade'] | null {
  if (typeof v !== 'string') return null;
  const normalized = v.trim().toUpperCase();
  return VALID_GRADES.has(normalized as ObservatoryResult['grade'])
    ? (normalized as ObservatoryResult['grade'])
    : null;
}

function coerceScore(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  return null;
}

// Returns null on any failure — caller must handle.
export async function runObservatory(website: string): Promise<ObservatoryResult | null> {
  const host = extractHost(website);
  if (!host) return null;

  const url = new URL(ANALYZE_ENDPOINT);
  url.searchParams.set('host', host);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', signal: controller.signal });
  } catch (err) {
    console.warn(`[observatory] fetch failed for ${host}:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.warn(`[observatory] non-200 for ${host}: ${res.status}`);
    return null;
  }

  let data: ObservatoryAnalyzeResponse;
  try {
    data = (await res.json()) as ObservatoryAnalyzeResponse;
  } catch (err) {
    console.warn(`[observatory] malformed JSON for ${host}:`, (err as Error).message);
    return null;
  }

  // v2 responses sometimes nest under `scan`; check both locations.
  const grade = coerceGrade(data?.grade) ?? coerceGrade(data?.scan?.grade);
  const score = coerceScore(data?.score) ?? coerceScore(data?.scan?.score);
  if (!grade || score === null) {
    console.warn(`[observatory] missing grade/score for ${host}`);
    return null;
  }

  return { grade, score };
}
