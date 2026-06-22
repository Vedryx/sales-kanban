import 'server-only';

// Google PageSpeed Insights (Lighthouse) runner. Used to auto-score a
// manually-added lead's website asynchronously after it lands on the board.
//
// No API key is strictly required, but the keyless quota is tiny and flaky.
// Set PAGESPEED_API_KEY in Vercel to lift it. Mobile strategy mirrors what
// the scraper records, so manual + scraped leads stay comparable.
//
// v2 (inline scorecard) — we request all 4 Lighthouse categories explicitly
// (PSI returns ONLY performance unless each category is named) and also
// capture CrUX field metrics from `loadingExperience.metrics` when present.
// Every read is defensive (`?.`) because the Lighthouse JSON schema drifts
// across point releases (esp. the in-flight 12.7+ insights migration) and a
// single missing field must never blow up the scorer.

export type PagespeedCategories = {
  performance: number; // 0-100 integer
  accessibility: number;
  bestPractices: number;
  seo: number;
};

export type PagespeedField = {
  lcpMs?: number;
  inpMs?: number;
  fcpMs?: number;
  cls?: number;
};

export type PagespeedResult = {
  // legacy: perf score, kept for backwards compat with existing card / render path
  score: number;
  flag: 'red' | 'amber' | 'green';
  metrics: Record<string, string | number>;
  // NEW: 4 Lighthouse category scores
  categories?: PagespeedCategories;
  // NEW: CrUX 28-day field data (absent for low-traffic domains — normal)
  field?: PagespeedField;
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
type PsiCategory = { score?: number | null };
// CrUX metric block — `percentile` is the p75 value (ms for timing, unitless for cls).
type CruxMetric = { percentile?: number; category?: string };
type PsiResponse = {
  lighthouseResult?: {
    categories?: {
      performance?: PsiCategory;
      accessibility?: PsiCategory;
      'best-practices'?: PsiCategory;
      seo?: PsiCategory;
    };
    audits?: Record<string, PsiAudit>;
  };
  loadingExperience?: {
    metrics?: {
      LARGEST_CONTENTFUL_PAINT_MS?: CruxMetric;
      INTERACTION_TO_NEXT_PAINT?: CruxMetric;
      FIRST_CONTENTFUL_PAINT_MS?: CruxMetric;
      CUMULATIVE_LAYOUT_SHIFT_SCORE?: CruxMetric;
    };
  };
};

// Convert a 0-1 Lighthouse score to 0-100 integer. Returns null if missing.
function toScore100(raw: number | null | undefined): number | null {
  if (typeof raw !== 'number') return null;
  return Math.round(raw * 100);
}

// CrUX CLS comes back as percentile * 100 (e.g. `15` = 0.15 CLS). Convert.
function clsFromCrux(raw: number | undefined): number | undefined {
  if (typeof raw !== 'number') return undefined;
  return Math.round((raw / 100) * 1000) / 1000;
}

// Throws on network / non-200 / missing perf score so the caller can decide
// whether to record an error. Never throws for a low score — a slow site is a
// result. Optional category / field reads degrade gracefully — they fall back
// to undefined and the email template handles their absence.
export async function runPagespeed(website: string): Promise<PagespeedResult> {
  const url = new URL(PSI_ENDPOINT);
  url.searchParams.set('url', website);
  url.searchParams.set('strategy', 'mobile');
  // PSI defaults to PERFORMANCE-only. To get accessibility / best-practices /
  // seo we MUST request each category explicitly (repeated `category` params);
  // omitting them returns just performance — which silently empties the
  // scorecard. Verified against the live API.
  for (const c of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']) {
    url.searchParams.append('category', c);
  }
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
  const cats = data?.lighthouseResult?.categories;
  const rawPerf = cats?.performance?.score;
  if (typeof rawPerf !== 'number') {
    throw new Error('psi_error:no_score');
  }
  const score = Math.round(rawPerf * 100);

  // Optional: 4 Lighthouse category scores. If any sub-score is missing, drop
  // the whole categories block so the email template falls back cleanly to the
  // legacy single-score line — better than rendering a half-populated table.
  let categories: PagespeedCategories | undefined;
  const perfScore = toScore100(cats?.performance?.score);
  const a11yScore = toScore100(cats?.accessibility?.score);
  const bpScore = toScore100(cats?.['best-practices']?.score);
  const seoScore = toScore100(cats?.seo?.score);
  if (
    perfScore !== null &&
    a11yScore !== null &&
    bpScore !== null &&
    seoScore !== null
  ) {
    categories = {
      performance: perfScore,
      accessibility: a11yScore,
      bestPractices: bpScore,
      seo: seoScore,
    };
  }

  // Optional: CrUX field data. Often absent for low-traffic domains — that's
  // normal; the scorecard falls back to a "lab data only" row.
  const crux = data?.loadingExperience?.metrics;
  let field: PagespeedField | undefined;
  const lcpMs = crux?.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
  const inpMs = crux?.INTERACTION_TO_NEXT_PAINT?.percentile;
  const fcpMs = crux?.FIRST_CONTENTFUL_PAINT_MS?.percentile;
  const cls = clsFromCrux(crux?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
  if (
    typeof lcpMs === 'number' ||
    typeof inpMs === 'number' ||
    typeof fcpMs === 'number' ||
    typeof cls === 'number'
  ) {
    field = {};
    if (typeof lcpMs === 'number') field.lcpMs = lcpMs;
    if (typeof inpMs === 'number') field.inpMs = inpMs;
    if (typeof fcpMs === 'number') field.fcpMs = fcpMs;
    if (typeof cls === 'number') field.cls = cls;
  }

  // Legacy lab metrics — unchanged shape so existing render path keeps working.
  const audits = data?.lighthouseResult?.audits ?? {};
  const pick = (id: string) => audits?.[id]?.displayValue;
  const metrics: Record<string, string | number> = {};
  const fcpLab = pick('first-contentful-paint');
  const lcpLab = pick('largest-contentful-paint');
  const tbtLab = pick('total-blocking-time');
  const clsLab = pick('cumulative-layout-shift');
  const siLab = pick('speed-index');
  if (fcpLab) metrics['First Contentful Paint'] = fcpLab;
  if (lcpLab) metrics['Largest Contentful Paint'] = lcpLab;
  if (tbtLab) metrics['Total Blocking Time'] = tbtLab;
  if (clsLab) metrics['Cumulative Layout Shift'] = clsLab;
  if (siLab) metrics['Speed Index'] = siLab;

  return { score, flag: flagForScore(score), metrics, categories, field };
}
