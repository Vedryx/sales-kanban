// Pure render — no Node-only imports. Safe to call from server route OR client
// preview pane. No DOM, no `document`, no `window`.
//
// DELIVERABILITY NOTE — this template is deliberately plain.
// It is a 1:1 cold-outreach email sent manually per lead, and the goal is the
// Gmail *Primary* tab, not Promotions. Gmail's Primary-vs-Promotions split is
// driven by content shape, so we keep it looking like a human typed it in
// Gmail: no logo banner, no inline images, minimal links (ideally one), system
// font, single column, no marketing footer. Founder accepted dropping the
// visible unsubscribe / postal-address footer for this low-volume 1:1 motion —
// opt-out is "reply and I won't follow up" + Reply-To = the SDR.
// If this ever becomes a bulk/templated blast, the CAN-SPAM footer
// (unsubscribe + registered postal address) MUST be reinstated.

import type { PagespeedMetrics } from '@/types/lead';

export type RenderInputs = {
  businessName: string;
  website?: string | null;
  pagespeed: {
    score: number;
    flag: 'red' | 'amber' | 'green';
    metrics?: PagespeedMetrics;
  };
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

export function renderPitchEmail(inputs: RenderInputs): RenderedEmail {
  // Soft, personal default subject. No score, no "we fixed it" — that reads as
  // an automated blast and pushes to Promotions. SDR can override in the modal.
  const subject = inputs.subject ?? `Quick note on ${inputs.businessName}'s site`;

  const demoUrl = safeUrl(inputs.demoUrl);
  const issues = renderIssues(inputs.pagespeed.metrics);
  const customNote = inputs.customNote?.trim();
  const sdrName = inputs.sdrName?.trim() || 'Dev';
  const psScoreStr = esc(String(inputs.pagespeed.score));

  // One link, max. The rebuilt-site link is the single CTA; everything else is
  // plain text. Screenshots, if the SDR attached any, become a short text line
  // of links rather than inline images (images are a strong Promotions signal).
  const demoLine = demoUrl
    ? `I went ahead and rebuilt it — here's the live version: <a href="${esc(demoUrl)}" style="color:#1a56db;">${esc(demoUrl)}</a>`
    : `I went ahead and rebuilt it. Want me to send the live link?`;

  const shotLinks = (inputs.screenshots ?? [])
    .map((s) => safeUrl(s.url))
    .filter((u): u is string => !!u);
  const shotsLine =
    shotLinks.length > 0
      ? `<br><br>A couple of before/after shots: ${shotLinks
          .map((u, i) => `<a href="${esc(u)}" style="color:#1a56db;">shot ${i + 1}</a>`)
          .join(', ')}`
      : '';

  const noteLine = customNote ? `<br><br>${esc(customNote)}` : '';

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#222222;max-width:600px;padding:8px 4px;">
Hi,<br><br>
I ran ${esc(inputs.businessName)}'s site through Google PageSpeed and it came back at <strong>${psScoreStr}/100</strong> on mobile. A few things dragging it down:
${issues.html}
${demoLine}${shotsLine}${noteLine}<br><br>
Happy to just hand over the rebuilt code, or run the technical side for you ongoing — whatever's easier on your end.<br><br>
Not the right person or not interested? Reply and I won't follow up.<br><br>
— ${esc(sdrName)}<br>
pulse.vedryxtech.com
</div>
</body>
</html>`;

  const text = renderPlainText({
    businessName: inputs.businessName,
    psScore: inputs.pagespeed.score,
    issuesText: issues.text,
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
    '',
    p.demoUrl
      ? `I went ahead and rebuilt it — here's the live version: ${p.demoUrl}`
      : `I went ahead and rebuilt it. Want me to send the live link?`,
  ];
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
    'pulse.vedryxtech.com',
  );
  return lines.join('\n');
}
