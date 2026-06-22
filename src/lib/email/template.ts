// Pure render — no Node-only imports. Safe to call from server route OR client
// preview pane. No DOM, no `document`, no `window`.
//
// DELIVERABILITY NOTE — this template is deliberately plain.
// It is a 1:1 cold-outreach email sent manually per lead, and the goal is the
// Gmail *Primary* tab, not Promotions. Gmail's Primary-vs-Promotions split is
// driven by content shape, so we keep it looking like a human typed it in
// Gmail: no logo banner, minimal links (ideally one), system
// font, single column, no marketing footer. Founder accepted dropping the
// visible unsubscribe / postal-address footer for this low-volume 1:1 motion —
// opt-out is "reply and I won't follow up" + Reply-To = the SDR.
// If this ever becomes a bulk/templated blast, the CAN-SPAM footer
// (unsubscribe + registered postal address) MUST be reinstated.
//
// SCREENSHOTS — when the SDR attaches before/after shots they render as inline
// `<img>` tags (one per line, single column, max-width 560px) below the demo
// line. No logo banners or marketing imagery; these are deliverable, plain
// screenshots embedded the same way a human would paste them into Gmail. The
// plain-text mirror keeps the link-list form (text/plain cannot embed images).
//
// SCORECARD (v2 inline) — between the 3-issue bullet list and the demo line we
// render a compact <table> "stats at a glance" block. Rules enforced here so
// Gmail keeps placing this in Primary:
//   - NO <img>, NO <style> block, NO <script>. Inline CSS only.
//   - bgcolor= attribute AND inline style="background:#xxx" — belt + suspenders
//     for clients that strip one or the other.
//   - Tints at ~10% saturation (not saturated banners — saturated banners
//     trigger Promotions).
//   - Unicode block characters (█▓▒░) for bar visualization, no image bars.
//   - Plain-text fallback mirrors the scorecard structure; a well-formed
//     text/plain that mirrors text/html is itself a Primary-tab signal.
//   - Every sub-block is optional and degrades gracefully: missing
//     `categories` → legacy single-score line; missing CrUX → lab-data
//     fallback row; null securityGrade → row spans remaining cells.

import type { PagespeedMetrics, PagespeedCategories, PagespeedField } from '@/types/lead';

export type RenderInputs = {
  businessName: string;
  website?: string | null;
  pagespeed: {
    score: number;
    flag: 'red' | 'amber' | 'green';
    metrics?: PagespeedMetrics;
    categories?: PagespeedCategories;
    field?: PagespeedField;
  };
  securityGrade?: string | null;
  demoUrl?: string | null;
  screenshots?: Array<{ url: string; alt?: string }>;
  customNote?: string | null;
  sdrName?: string | null;
  // Optional override for the auto-generated subject.
  subject?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

// HTML-escape user content before interpolation.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// URL-validate before emitting. We don't fetch the URL; this is just to
// prevent javascript:/data: URI injection if a hostile SDR copy-pastes one.
function safeUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== 'string') return null;
  const trimmed = u.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

// Pretty-print a metric key. "LCP" / "CLS" / "TBT" stay uppercase; longer
// snake/camelCase names get spaced.
function prettyMetricKey(k: string): string {
  if (k.length <= 4 && k === k.toUpperCase()) return k;
  return k
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Up to 3 pain points, kept short. A person listing a couple of issues — not a
// metrics dashboard. Returns both HTML (<ul>) and plain-text (dash) forms.
function renderIssues(metrics?: PagespeedMetrics): { html: string; text: string } {
  const entries = metrics ? Object.entries(metrics).slice(0, 3) : [];
  if (entries.length === 0) {
    const line = 'pages load slowly enough that real visitors bounce before they convert';
    return {
      html: `<ul style="margin:6px 0;padding-left:20px;"><li>${esc(line)}</li></ul>`,
      text: `- ${line}`,
    };
  }
  const htmlItems = entries
    .map(([k, v]) => `<li>${esc(prettyMetricKey(k))}: ${esc(String(v))}</li>`)
    .join('');
  const textItems = entries.map(([k, v]) => `- ${prettyMetricKey(k)}: ${String(v)}`).join('\n');
  return {
    html: `<ul style="margin:6px 0;padding-left:20px;">${htmlItems}</ul>`,
    text: textItems,
  };
}

// Score → desaturated tint color. ~10% saturation so the cell reads as a
// faint background tint, never a saturated banner (saturated colored banners
// are a strong Promotions-tab trigger in Gmail).
function tintForScore(score: number): { bg: string; fg: string; label: 'green' | 'amber' | 'red' } {
  if (score >= 90) return { bg: '#e8f3eb', fg: '#216234', label: 'green' };
  if (score >= 50) return { bg: '#fdf2e0', fg: '#7a4d11', label: 'amber' };
  return { bg: '#fbe7e3', fg: '#7a2a1f', label: 'red' };
}

// 5-cell bar using Unicode blocks. Score 0-100 → 0..5 filled cells.
// `█` filled, `░` empty. Email clients render these consistently in system
// fonts; no image required.
function barForScore(score: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(score / 20)));
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

// LCP in ms → "1.8s" string. CrUX returns p75 LCP as milliseconds.
function fmtMs(ms: number | undefined): string | null {
  if (typeof ms !== 'number') return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// One row of the scorecard. Defensive against undefined values from upstream.
function scoreRow(label: string, score: number): string {
  const tint = tintForScore(score);
  const bar = barForScore(score);
  // bgcolor= attribute mirrors the inline style so clients that strip one keep
  // the tint. The bar cell uses a monospace stack so the blocks align.
  return (
    `<tr>` +
    `<td bgcolor="${tint.bg}" style="background:${tint.bg};padding:6px 10px;font-size:13px;color:#222;border-top:1px solid #eee;">${esc(label)}</td>` +
    `<td bgcolor="${tint.bg}" style="background:${tint.bg};padding:6px 10px;font-size:13px;font-weight:700;color:${tint.fg};border-top:1px solid #eee;text-align:right;width:50px;">${score}</td>` +
    `<td bgcolor="${tint.bg}" style="background:${tint.bg};padding:6px 10px;font-size:13px;color:${tint.fg};font-family:Menlo,Consolas,monospace;border-top:1px solid #eee;width:70px;letter-spacing:1px;">${bar}</td>` +
    `<td bgcolor="${tint.bg}" style="background:${tint.bg};padding:6px 10px;font-size:12px;color:${tint.fg};border-top:1px solid #eee;width:60px;">${tint.label}</td>` +
    `</tr>`
  );
}

// CrUX summary cell content (left half of bottom row). Falls back to lab LCP
// when CrUX is absent (low-traffic domains — totally normal).
function cruxOrLabSummary(
  field: PagespeedField | undefined,
  metrics: PagespeedMetrics | undefined,
): string {
  const cruxLcp = fmtMs(field?.lcpMs);
  if (cruxLcp) {
    return `Real users (28-day): LCP ${cruxLcp}`;
  }
  // Lab fallback: pull whatever LCP-shaped metric is present in legacy lab data.
  const labLcp =
    metrics?.['Largest Contentful Paint'] ?? metrics?.['LCP'] ?? metrics?.['lcp'];
  if (labLcp !== undefined && labLcp !== null && String(labLcp).trim() !== '') {
    return `Lab data: LCP ${esc(String(labLcp))}`;
  }
  return 'Lab data only';
}

// Build the scorecard <table>. Returns empty string when categories absent —
// caller then falls back to the legacy single-score sentence (today's
// behavior).
function renderScorecard(inputs: RenderInputs): string {
  const cats = inputs.pagespeed.categories;
  if (!cats) return '';

  const rows = [
    scoreRow('Performance', cats.performance),
    scoreRow('Accessibility', cats.accessibility),
    scoreRow('Best Practices', cats.bestPractices),
    scoreRow('SEO', cats.seo),
  ].join('');

  const cruxText = cruxOrLabSummary(inputs.pagespeed.field, inputs.pagespeed.metrics);
  const grade = inputs.securityGrade ?? null;

  // Bottom summary row: CrUX (or lab fallback) on the left, security grade on
  // the right. If no security grade, the summary cell spans all 4 columns.
  let summaryRow: string;
  if (grade && grade.trim() !== '') {
    summaryRow =
      `<tr>` +
      `<td colspan="2" bgcolor="#f7f7f7" style="background:#f7f7f7;padding:8px 10px;font-size:12px;color:#444;border-top:1px solid #eee;">${cruxText}</td>` +
      `<td colspan="2" bgcolor="#f7f7f7" style="background:#f7f7f7;padding:8px 10px;font-size:12px;color:#444;border-top:1px solid #eee;text-align:right;">Security grade: <strong style="color:#222;">${esc(grade)}</strong></td>` +
      `</tr>`;
  } else {
    summaryRow =
      `<tr>` +
      `<td colspan="4" bgcolor="#f7f7f7" style="background:#f7f7f7;padding:8px 10px;font-size:12px;color:#444;border-top:1px solid #eee;">${cruxText}</td>` +
      `</tr>`;
  }

  const header =
    `<tr>` +
    `<td colspan="4" bgcolor="#fafafa" style="background:#fafafa;padding:6px 10px;font-size:11px;font-weight:700;letter-spacing:0.5px;color:#666;text-transform:uppercase;">Web audit — ${esc(inputs.businessName)}</td>` +
    `</tr>`;

  return (
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:10px 0;border:1px solid #eee;">` +
    header +
    rows +
    summaryRow +
    `</table>`
  );
}

// Plain-text scorecard — mirrors the HTML structure. Some Gmail mobile
// clients prefer text/plain when it's present and well-formed; a text/plain
// that mirrors text/html is a Primary-tab signal.
function renderScorecardText(inputs: RenderInputs): string {
  const cats = inputs.pagespeed.categories;
  if (!cats) return '';

  const lines = [
    `Web audit — ${inputs.businessName}`,
    `  Performance:    ${String(cats.performance).padStart(3)} / 100`,
    `  Accessibility:  ${String(cats.accessibility).padStart(3)} / 100`,
    `  Best Practices: ${String(cats.bestPractices).padStart(3)} / 100`,
    `  SEO:            ${String(cats.seo).padStart(3)} / 100`,
  ];
  const cruxLcp = fmtMs(inputs.pagespeed.field?.lcpMs);
  if (cruxLcp) {
    lines.push(`  Real users (28-day): LCP ${cruxLcp}`);
  } else {
    const labLcp =
      inputs.pagespeed.metrics?.['Largest Contentful Paint'] ??
      inputs.pagespeed.metrics?.['LCP'] ??
      inputs.pagespeed.metrics?.['lcp'];
    if (labLcp !== undefined && labLcp !== null && String(labLcp).trim() !== '') {
      lines.push(`  Lab data: LCP ${labLcp}`);
    }
  }
  if (inputs.securityGrade && inputs.securityGrade.trim() !== '') {
    lines.push(`  Security grade: ${inputs.securityGrade}`);
  }
  return lines.join('\n');
}

export function renderPitchEmail(inputs: RenderInputs): RenderedEmail {
  // Soft, personal default subject. No score, no "we fixed it" — that reads as
  // an automated blast and pushes to Promotions. SDR can override in the modal.
  const subject = inputs.subject ?? `Quick note on ${inputs.businessName}'s site`;

  const demoUrl = safeUrl(inputs.demoUrl);
  const issues = renderIssues(inputs.pagespeed.metrics);
  const customNote = inputs.customNote?.trim();
  const sdrName = inputs.sdrName?.trim() || 'Dev Saini';
  const psScoreStr = esc(String(inputs.pagespeed.score));

  // Scorecard goes BELOW the 3-issue bullets and ABOVE the demo line — that's
  // the founder-spec placement. Empty string when categories absent (legacy
  // single-score path is the existing behavior).
  const scorecard = renderScorecard(inputs);
  const scorecardText = renderScorecardText(inputs);

  // One link, max. The rebuilt-site link is the single CTA; everything else is
  // plain text. Screenshots, if the SDR attached any, render as inline <img>
  // tags below the demo line (one per line, single column). The plain-text
  // mirror keeps the link-list form since text/plain cannot embed images.
  const demoLine = demoUrl
    ? `I went ahead and rebuilt it — here's the live version: <a href="${esc(demoUrl)}" style="color:#1a56db;">${esc(demoUrl)}</a>`
    : `I went ahead and rebuilt it. Want me to send the live link?`;

  // Screenshot pipeline: keep BOTH the safe URL and the (possibly user-supplied)
  // alt so the <img> renders with a meaningful alt attribute. Default alt is
  // "screenshot N" (1-indexed) when input alt is missing/empty. URL goes
  // through safeUrl() (http(s) only) then esc() for the src attr. If every
  // screenshot fails the safeUrl gate the block emits nothing (no stray
  // <br><br>) — same as today.
  const safeShots = (inputs.screenshots ?? [])
    .map((s, i) => {
      const u = safeUrl(s.url);
      if (!u) return null;
      const rawAlt = (s.alt ?? '').trim();
      const alt = rawAlt !== '' ? rawAlt : `screenshot ${i + 1}`;
      return { url: u, alt };
    })
    .filter((s): s is { url: string; alt: string } => !!s);

  // NO width=/height= attributes (they break mobile rendering); max-width via
  // inline style only. display:block kills baseline gaps; border:0/outline:none
  // suppresses default link-image borders in legacy clients.
  const shotsLine =
    safeShots.length > 0
      ? `<br><br>` +
        safeShots
          .map(
            (s) =>
              `<img src="${esc(s.url)}" alt="${esc(s.alt)}" style="display:block;max-width:560px;width:100%;height:auto;border:0;outline:none;margin:10px 0;border-radius:4px;">`,
          )
          .join('')
      : '';

  // Plain-text mirror still uses the link-list form — text/plain can't embed
  // images. Mirror only includes the URL list.
  const shotLinks = safeShots.map((s) => s.url);

  const noteLine = customNote ? `<br><br>${esc(customNote)}` : '';

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#222222;max-width:600px;padding:8px 4px;">
Hi,<br><br>
I ran ${esc(inputs.businessName)}'s site through Google PageSpeed and it came back at <strong>${psScoreStr}/100</strong> on mobile. A few things dragging it down:
${issues.html}
${scorecard}
${demoLine}${shotsLine}${noteLine}<br><br>
Happy to just hand over the rebuilt code, or run the technical side for you ongoing — whatever's easier on your end.<br><br>
Not the right person or not interested? Reply and I won't follow up.<br><br>
— ${esc(sdrName)}<br>
vedryxtech.com
</div>
</body>
</html>`;

  const text = renderPlainText({
    businessName: inputs.businessName,
    psScore: inputs.pagespeed.score,
    issuesText: issues.text,
    scorecardText,
    demoUrl,
    shotLinks,
    customNote,
    sdrName,
  });

  return { subject, html, text };
}

function renderPlainText(p: {
  businessName: string;
  psScore: number;
  issuesText: string;
  scorecardText: string;
  demoUrl: string | null;
  shotLinks: string[];
  customNote?: string;
  sdrName: string;
}): string {
  const lines = [
    'Hi,',
    '',
    `I ran ${p.businessName}'s site through Google PageSpeed and it came back at ${p.psScore}/100 on mobile. A few things dragging it down:`,
    '',
    p.issuesText,
  ];
  if (p.scorecardText) {
    lines.push('', p.scorecardText);
  }
  lines.push(
    '',
    p.demoUrl
      ? `I went ahead and rebuilt it — here's the live version: ${p.demoUrl}`
      : `I went ahead and rebuilt it. Want me to send the live link?`,
  );
  if (p.shotLinks.length > 0) {
    lines.push('', `Before/after shots: ${p.shotLinks.join(' , ')}`);
  }
  if (p.customNote) {
    lines.push('', p.customNote);
  }
  lines.push(
    '',
    "Happy to just hand over the rebuilt code, or run the technical side for you ongoing — whatever's easier on your end.",
    '',
    "Not the right person or not interested? Reply and I won't follow up.",
    '',
    `— ${p.sdrName}`,
    'vedryxtech.com',
  );
  return lines.join('\n');
}
