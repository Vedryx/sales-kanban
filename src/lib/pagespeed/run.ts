import 'server-only';

// Google PageSpeed Insights (Lighthouse) runner. Used to auto-score a
// manually-added lead's website asynchronously after it lands on the board.
//
// No API key is strictly required, but the keyless quota is tiny and flaky.
// Set PAGESPEED_API_KEY in Vercel to lift it. Mobile strategy mirrors what
// the scraper records, so manual + scraped leads stay comparable.

export type PagespeedResult = {
  score: number; // 0-100 integer
  flag: 'red' | 'amber' | 'green';
  metrics: Record<string, string | number>;
};

// Lighthouse's own performance-score thresholds.
export function flagForScore(score: number): 'red' | 'amber' | 'green' {
  if (score >= 90) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const TIMEOUT_MS = 50_000;

type PsiAudit = { displayValue?: string; numericValue?: number };
type PsiResponse = {
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, PsiAudit>;
  };
};

// Throws on network / non-200 / missing score so the caller can decide whether
// to record an error. Never throws for a low score — a slow site is a result.
export async function runPagespeed(website: string): Promise<PagespeedResult> {
  const url = new URL(PSI_ENDPOINT);
  url.searchParams.set('url', website);
  url.searchParams.set('strategy', 'mobile');
  url.searchParams.set('category', 'performance');
  const key = process.env.PAGESPEED_API_KEY;
  if (key) url.searchParams.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`psi_error:${res.status}:${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as PsiResponse;
  const raw = data.lighthouseResult?.categories?.performance?.score;
  if (typeof raw !== 'number') {
    throw new Error('psi_error:no_score');
  }
  const score = Math.round(raw * 100);

  const audits = data.lighthouseResult?.audits ?? {};
  const pick = (id: string) => audits[id]?.displayValue;
  const metrics: Record<string, string | number> = {};
  const fcp = pick('first-contentful-paint');
  const lcp = pick('largest-contentful-paint');
  const tbt = pick('total-blocking-time');
  const cls = pick('cumulative-layout-shift');
  const si = pick('speed-index');
  if (fcp) metrics['First Contentful Paint'] = fcp;
  if (lcp) metrics['Largest Contentful Paint'] = lcp;
  if (tbt) metrics['Total Blocking Time'] = tbt;
  if (cls) metrics['Cumulative Layout Shift'] = cls;
  if (si) metrics['Speed Index'] = si;

  return { score, flag: flagForScore(score), metrics };
}
