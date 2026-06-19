// Pure render — no Node-only imports. Safe to call from server route OR client
// preview pane. No DOM, no `document`, no `window`.
//
// Template is hand-authored email-client-safe HTML (tables + inline CSS).
// See workspace/sk-pitch-email/design.md for the visual contract.
// Body copy is the CMO-approved final at
// workspace/sk-pitch-email/content/pitch-email.md (subject variant A primary).

import type { PagespeedMetrics } from '@/types/lead';

// === CAN-SPAM / GDPR footer constants ===========================
// TODO_POSTAL_ADDRESS — founder must replace with the real registered
// business address before the first live send. Deploy gate: a real send
// with this placeholder still in place is a CAN-SPAM §7704 defect.
const TODO_POSTAL_ADDRESS =
  'Vedryx Pulse · [TODO_POSTAL_ADDRESS — registered business address required before live send]';

const UNSUBSCRIBE_MAILTO = 'unsubscribe@vedryxtech.com';

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

const FLAG_COLOR: Record<'red' | 'amber' | 'green', string> = {
  red: '#c5594a',
  amber: '#d6952a',
  green: '#5ea16b',
};

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
// snake/camelCase names get spaced. Pure text, escaped at the call site.
function prettyMetricKey(k: string): string {
  if (k.length <= 4 && k === k.toUpperCase()) return k;
  return k
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// CMO body slot {{issuesList}} — bullet list of pagespeed pain points.
// HTML version: <ul>. Plain-text version: dash bullets. Returns both.
function renderIssuesList(metrics?: PagespeedMetrics): { html: string; text: string } {
  if (!metrics || Object.keys(metrics).length === 0) {
    const line =
      'Real users are bouncing on slow pages before they convert.';
    return {
      html: `<ul style="margin:8px 0 0;padding-left:20px;color:#1b1715;font-size:15px;line-height:1.55;"><li>${esc(line)}</li></ul>`,
      text: `- ${line}`,
    };
  }
  const entries = Object.entries(metrics).slice(0, 5);
  const htmlItems = entries
    .map(
      ([k, v]) =>
        `<li style="margin-top:4px;"><strong>${esc(prettyMetricKey(k))}</strong> ${esc(String(v))}</li>`,
    )
    .join('');
  const textItems = entries
    .map(([k, v]) => `- ${prettyMetricKey(k)} ${String(v)}`)
    .join('\n');
  return {
    html: `<ul style="margin:8px 0 0;padding-left:20px;color:#1b1715;font-size:15px;line-height:1.55;">${htmlItems}</ul>`,
    text: textItems,
  };
}

function renderScreenshotsBlock(shots?: Array<{ url: string; alt?: string }>): string {
  if (!shots || shots.length === 0) return '';
  const rows = shots
    .map((s) => {
      const url = safeUrl(s.url);
      if (!url) return '';
      const alt = esc(s.alt ?? 'Rebuild screenshot');
      return `<tr><td style="padding-top:12px;">
        <img src="${esc(url)}" alt="${alt}" width="540" style="display:block;width:100%;max-width:540px;height:auto;border:0;border-radius:6px;">
      </td></tr>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">${rows}</table>`;
}

export function renderPitchEmail(inputs: RenderInputs): RenderedEmail {
  // CMO-approved subject variant A.
  const subject =
    inputs.subject ??
    `${inputs.businessName} — your site scores ${inputs.pagespeed.score}. We fixed it.`;
  const preheader =
    'The issues holding your site back — and a working rebuild we already deployed.';
  const flagColor = FLAG_COLOR[inputs.pagespeed.flag];
  const psFlagLabel = inputs.pagespeed.flag.toUpperCase();
  const websiteUrl = safeUrl(inputs.website);
  const psReportUrl = websiteUrl
    ? `https://pagespeed.web.dev/report?url=${encodeURIComponent(websiteUrl)}`
    : 'https://pagespeed.web.dev/';
  const demoUrl = safeUrl(inputs.demoUrl);
  const screenshotsBlock = renderScreenshotsBlock(inputs.screenshots);
  const issues = renderIssuesList(inputs.pagespeed.metrics);
  const customNote = inputs.customNote?.trim();
  const sdrName = inputs.sdrName?.trim() || 'The Vedryx Pulse team';
  const psScoreStr = esc(String(inputs.pagespeed.score));

  // CMO body line: "We rebuilt it. You can see the result here: **{{demoUrl}}**"
  // When demoUrl absent, fall back to a graceful reply-prompt — the conditional
  // screenshot block stays separate.
  const demoLine = demoUrl
    ? `We rebuilt it. You can see the result here: <strong><a href="${esc(demoUrl)}" style="color:#d6952a;text-decoration:underline;">${esc(demoUrl)}</a></strong>`
    : "We rebuilt it. Reply and I'll send the live link.";

  const customNoteBlock = customNote
    ? `<tr><td class="px-mob" style="padding:24px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-left:3px solid #d6952a;">
          <tr><td style="padding:8px 16px;font-size:14px;line-height:1.55;color:#1b1715;font-style:italic;">${esc(customNote)}</td></tr>
        </table>
      </td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  body, .bg { background: #1a1614 !important; }
  .surface { background: #221c19 !important; }
  .ink { color: #f5ede3 !important; }
  .ink-soft { color: #b8aea0 !important; }
  .border { border-color: #3a302a !important; }
}
@media (max-width: 480px) {
  .px-mob { padding-left: 16px !important; padding-right: 16px !important; }
}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#fdfaf6;font-family:Arial,Helvetica,sans-serif;color:#1b1715;">
<div style="display:none;font-size:1px;color:#fdfaf6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg" style="background:#fdfaf6;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">

<tr><td class="px-mob" style="padding:32px 32px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td align="left"><img src="https://pulse.vedryxtech.com/logo-email.png" width="120" height="28" alt="Vedryx Pulse" style="display:block;border:0;"></td>
<td align="right" class="ink-soft" style="font-size:12px;color:#5a514a;">Vedryx Pulse · 19-day product builds</td>
</tr>
</table>
</td></tr>

<tr><td class="px-mob ink" style="padding:24px 32px 0;font-size:15px;line-height:1.55;color:#1b1715;">Hi,</td></tr>

<tr><td class="px-mob ink" style="padding:16px 32px 0;font-size:15px;line-height:1.55;color:#1b1715;">
Your site scored <strong style="color:${flagColor};">${psScoreStr}/100</strong> on PageSpeed. The issues holding it back:
${issues.html}
</td></tr>

<tr><td class="px-mob" style="padding:16px 32px 0;">
<a href="${esc(psReportUrl)}" style="font-size:12px;color:#5a514a;text-decoration:underline;">Open the full PageSpeed report ↗</a>
</td></tr>

<tr><td class="px-mob ink" style="padding:24px 32px 0;font-size:15px;line-height:1.55;color:#1b1715;">
${demoLine}
</td></tr>

${screenshotsBlock ? `<tr><td class="px-mob" style="padding:0 32px;">${screenshotsBlock}</td></tr>` : ''}

<tr><td class="px-mob ink" style="padding:24px 32px 0;font-size:15px;line-height:1.55;color:#1b1715;">
We&#39;re Vedryx Pulse — we handle the technical side for founders who don&#39;t have an engineering team. No agency overhead. We ship working products.
</td></tr>

<tr><td class="px-mob ink" style="padding:24px 32px 0;font-size:15px;line-height:1.55;color:#1b1715;">
If the rebuilt site looks right to you, two options:
<ul style="margin:8px 0 0;padding-left:20px;">
  <li style="margin-top:6px;"><strong>Take the code.</strong> We hand it over. You deploy it. Done.</li>
  <li style="margin-top:6px;"><strong>Let us run your tech.</strong> We become your engineering team — builds, fixes, everything ongoing.</li>
</ul>
</td></tr>

<tr><td class="px-mob ink" style="padding:24px 32px 0;font-size:15px;line-height:1.55;color:#1b1715;">
No call needed to decide. The demo is self-explanatory.
</td></tr>

${customNoteBlock}

<tr><td class="px-mob ink" style="padding:32px 32px 0;font-size:15px;line-height:1.55;color:#1b1715;">
— ${esc(sdrName)}<br>
Vedryx Pulse | <a href="https://pulse.vedryxtech.com" style="color:#5a514a;text-decoration:underline;">pulse.vedryxtech.com</a>
</td></tr>

<tr><td class="px-mob ink-soft" style="padding:16px 32px 0;font-size:13px;line-height:1.55;color:#5a514a;font-style:italic;">
Not interested or wrong person? Reply and I won&#39;t follow up.
</td></tr>

<tr><td class="px-mob" style="padding:32px;">
<hr class="border" style="border:none;border-top:1px solid #e8e1d6;margin:0 0 16px;">
<p class="ink-soft" style="margin:0;font-size:11px;line-height:1.5;color:#5a514a;">
${esc(TODO_POSTAL_ADDRESS)}<br>
<a href="mailto:${UNSUBSCRIBE_MAILTO}?subject=unsubscribe" style="color:#5a514a;text-decoration:underline;">Unsubscribe</a> · <a href="https://pulse.vedryxtech.com" style="color:#5a514a;text-decoration:underline;">pulse.vedryxtech.com</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = renderPlainText({
    businessName: inputs.businessName,
    psScore: inputs.pagespeed.score,
    psFlag: psFlagLabel,
    psReportUrl,
    issuesText: issues.text,
    demoUrl,
    customNote,
    sdrName,
  });

  return { subject, html, text };
}

function renderPlainText(p: {
  businessName: string;
  psScore: number;
  psFlag: string;
  psReportUrl: string;
  issuesText: string;
  demoUrl: string | null;
  customNote?: string;
  sdrName: string;
}): string {
  const lines = [
    'Hi,',
    '',
    `Your site scored ${p.psScore}/100 on PageSpeed (${p.psFlag}). The issues holding it back:`,
    '',
    p.issuesText,
    '',
    `Full report: ${p.psReportUrl}`,
    '',
  ];
  if (p.demoUrl) {
    lines.push(`We rebuilt it. You can see the result here: ${p.demoUrl}`, '');
  } else {
    lines.push("We rebuilt it. Reply and I'll send the live link.", '');
  }
  lines.push(
    "We're Vedryx Pulse — we handle the technical side for founders who don't have an engineering team. No agency overhead. We ship working products.",
    '',
    'If the rebuilt site looks right to you, two options:',
    '- Take the code. We hand it over. You deploy it. Done.',
    '- Let us run your tech. We become your engineering team — builds, fixes, everything ongoing.',
    '',
    'No call needed to decide. The demo is self-explanatory.',
    '',
  );
  if (p.customNote) {
    lines.push(p.customNote, '');
  }
  lines.push(
    `— ${p.sdrName}`,
    'Vedryx Pulse | pulse.vedryxtech.com',
    '',
    "Not interested or wrong person? Reply and I won't follow up.",
    '',
    '—',
    TODO_POSTAL_ADDRESS,
    `Unsubscribe: mailto:${UNSUBSCRIBE_MAILTO}?subject=unsubscribe`,
  );
  return lines.join('\n');
}
