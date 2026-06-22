import { describe, expect, it } from 'vitest';
import { renderPitchEmail } from '../src/lib/email/template';
import { addressOf, sanitizeDisplayName, composeFrom } from '../src/lib/email/send';

describe('renderPitchEmail — plain personal template (Primary-tab shaped)', () => {
  it('minimal: score, no demo, no shots, no note', () => {
    const out = renderPitchEmail({
      businessName: "Sally's Salon",
      website: 'https://sallys.example.com',
      pagespeed: { score: 42, flag: 'red' },
    });
    // Soft personal subject — no score, no "we fixed it".
    expect(out.subject).toContain("Sally's Salon");
    expect(out.subject).toContain('Quick note');
    expect(out.subject).not.toContain('42');
    expect(out.subject).not.toContain('We fixed it');
    // Business name is escaped in the HTML body.
    expect(out.html).toContain('Sally&#39;s Salon');
    expect(out.html).toContain('42/100');
    // No demo URL → reply-prompt fallback, no hyperlinked rebuilt-site line.
    expect(out.html).not.toContain("here's the live version");
    expect(out.html).toContain('Want me to send the live link?');
    expect(out.text).toContain('42/100');
  });

  it('full: demo url + 2 screenshots (inline <img>) + custom note + metrics', () => {
    const out = renderPitchEmail({
      businessName: 'Acme Co',
      website: 'https://acme.example.com',
      pagespeed: {
        score: 67,
        flag: 'amber',
        metrics: { LCP: '4.1s', CLS: 0.18, TBT: '480ms' },
      },
      demoUrl: 'https://pulse-demo.vedryxtech.com/acme',
      screenshots: [
        { url: 'https://blob.example/a.png', alt: 'home' },
        { url: 'https://blob.example/b.png', alt: 'contact' },
      ],
      customNote: 'Quick note about their pricing page.',
      sdrName: 'Dev S.',
    });
    expect(out.html).toContain("here's the live version");
    expect(out.html).toContain('https://pulse-demo.vedryxtech.com/acme');
    // Screenshots render as inline <img> tags now (one per screenshot).
    expect(out.html).toContain('<img');
    expect(out.html).toContain('src="https://blob.example/a.png"');
    expect(out.html).toContain('src="https://blob.example/b.png"');
    // alt attribute is set (user-supplied alts preserved).
    expect(out.html).toMatch(/<img[^>]*alt="home"/);
    expect(out.html).toMatch(/<img[^>]*alt="contact"/);
    // NO width=/height= attributes on the screenshot <img> tags.
    expect(out.html).not.toMatch(/<img[^>]*\swidth="/);
    expect(out.html).not.toMatch(/<img[^>]*\sheight="/);
    // Plain-text mirror keeps the link-list form (text/plain cannot embed images).
    expect(out.text).toContain('Before/after shots');
    expect(out.text).toContain('https://blob.example/a.png');
    expect(out.text).toContain('https://blob.example/b.png');
    expect(out.html).toContain('LCP');
    expect(out.html).toContain('4.1s');
    expect(out.html).toContain('Quick note about their pricing page.');
    expect(out.html).toContain('Dev S.');
    // New plain close.
    expect(out.html).toContain('hand over the rebuilt code');
    expect(out.text).toContain('Quick note about their pricing page.');
    expect(out.text).toContain('hand over the rebuilt code');
  });

  it('refuses javascript: / data: URLs in demoUrl + screenshots', () => {
    const out = renderPitchEmail({
      businessName: 'Bad URL Co',
      website: 'https://x.example.com',
      pagespeed: { score: 30, flag: 'red' },
      demoUrl: 'javascript:alert(1)',
      screenshots: [{ url: 'data:image/png;base64,iVBOR...' }],
    });
    expect(out.html).not.toContain('javascript:');
    expect(out.html).not.toContain('data:image');
    // Hostile demo → fallback path.
    expect(out.html).not.toContain("here's the live version");
    // safeUrl() strips the data: URL so no <img> is emitted.
    expect(out.html).not.toContain('<img');
  });

  it('HTML-escapes user content in businessName + customNote', () => {
    const out = renderPitchEmail({
      businessName: '<script>alert(1)</script>',
      website: 'https://x.example.com',
      pagespeed: { score: 30, flag: 'red' },
      customNote: '"><img src=x onerror=alert(1)>',
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&quot;&gt;&lt;img');
  });

  it('produces a plain-text version', () => {
    const out = renderPitchEmail({
      businessName: 'Plain Text Co',
      pagespeed: { score: 80, flag: 'green' },
    });
    expect(out.subject).toContain('Plain Text Co');
    expect(out.text).toContain('vedryxtech.com');
    expect(out.text).not.toContain('pulse.vedryxtech.com');
    expect(out.text).toContain('80/100');
    expect(out.text).toContain("Not the right person or not interested");
  });

  it('deliverability: no marketing footer (unsubscribe / postal address dropped)', () => {
    const out = renderPitchEmail({
      businessName: 'Footer Co',
      pagespeed: { score: 50, flag: 'amber' },
    });
    // The CAN-SPAM footer was intentionally removed for the 1:1 Primary motion.
    expect(out.html).not.toContain('TODO_POSTAL_ADDRESS');
    expect(out.html).not.toContain('mailto:unsubscribe');
    expect(out.text).not.toContain('mailto:unsubscribe');
    // No logo banner / inline images either.
    expect(out.html).not.toContain('<img');
  });
});

describe('renderPitchEmail — inline scorecard (Primary-tab shaped)', () => {
  const fullScorecardInputs = {
    businessName: 'Acme Co',
    website: 'https://acme.example.com',
    pagespeed: {
      score: 34,
      flag: 'red' as const,
      metrics: { LCP: '4.1s', CLS: 0.18, TBT: '480ms' },
      categories: { performance: 34, accessibility: 71, bestPractices: 83, seo: 91 },
      field: { lcpMs: 6200, inpMs: 410, fcpMs: 2100, cls: 0.12 },
    },
    securityGrade: 'F',
  };

  it('renders the scorecard block with all 4 category scores + CrUX + security', () => {
    const out = renderPitchEmail(fullScorecardInputs);
    // Scorecard table header.
    expect(out.html).toContain('Web audit');
    expect(out.html).toContain('Acme Co');
    // 4 category rows present.
    expect(out.html).toContain('Performance');
    expect(out.html).toContain('Accessibility');
    expect(out.html).toContain('Best Practices');
    expect(out.html).toContain('SEO');
    // Scores rendered.
    expect(out.html).toContain('>34<');
    expect(out.html).toContain('>71<');
    expect(out.html).toContain('>83<');
    expect(out.html).toContain('>91<');
    // CrUX LCP formatted (6200ms → 6.2s).
    expect(out.html).toContain('Real users (28-day)');
    expect(out.html).toContain('LCP 6.2s');
    // Security row.
    expect(out.html).toContain('Security grade');
    expect(out.html).toContain('<strong style="color:#222;">F</strong>');
    // Unicode bar present (any block char).
    expect(out.html).toMatch(/[█░▓▒]/);
  });

  it('scorecard is safe for Gmail Primary: no <img>/<style>/<script> in scorecard block, exactly one <a>', () => {
    // No screenshots in this case — full Gmail-Primary safety surface
    // (scorecard + body) stays image-free. Screenshot-as-<img> is exercised in
    // the other suite; the scorecard table itself MUST never contain <img>.
    const out = renderPitchEmail({
      ...fullScorecardInputs,
      demoUrl: 'https://pulse-demo.vedryxtech.com/acme',
    });
    // Whole HTML safe — no screenshots input means no <img> anywhere.
    expect(out.html).not.toContain('<img');
    expect(out.html).not.toContain('<style');
    expect(out.html).not.toContain('<script');
    // Exactly one <a> tag — the single demo URL CTA.
    const anchorCount = (out.html.match(/<a\s/g) ?? []).length;
    expect(anchorCount).toBe(1);
  });

  it('scorecard table itself contains no <img> even when screenshots are present', () => {
    // Belt-and-suspenders: the scorecard <table> block must stay image-free
    // even when the body has screenshot <img> tags below the demo line. This
    // guards against anyone ever moving the screenshot block into the
    // scorecard.
    const out = renderPitchEmail({
      ...fullScorecardInputs,
      demoUrl: 'https://pulse-demo.vedryxtech.com/acme',
      screenshots: [
        { url: 'https://blob.example/a.png', alt: 'before' },
        { url: 'https://blob.example/b.png', alt: 'after' },
      ],
    });
    // Locate the scorecard <table>...</table> substring and assert <img>-free.
    const tableMatch = out.html.match(/<table[\s\S]*?<\/table>/);
    expect(tableMatch).not.toBeNull();
    const scorecardHtml = tableMatch![0];
    expect(scorecardHtml).not.toContain('<img');
    // The two screenshot <img> tags ARE present in the body, just not in the table.
    const imgCount = (out.html.match(/<img\b/g) ?? []).length;
    expect(imgCount).toBe(2);
  });

  it('scorecard uses bgcolor= AND inline style="background:..." for client compat', () => {
    const out = renderPitchEmail(fullScorecardInputs);
    expect(out.html).toMatch(/bgcolor="#[a-f0-9]{6}"/i);
    expect(out.html).toMatch(/style="[^"]*background:#[a-f0-9]{6}/i);
  });

  it('legacy: scorecard absent when categories undefined — falls back to original single-score line', () => {
    const out = renderPitchEmail({
      businessName: 'Legacy Co',
      pagespeed: { score: 42, flag: 'red' },
    });
    // No scorecard table.
    expect(out.html).not.toContain('Web audit');
    expect(out.html).not.toMatch(/<table/);
    // Legacy single-score sentence still present.
    expect(out.html).toContain('42/100');
    expect(out.text).not.toContain('Web audit');
    expect(out.text).toContain('42/100');
  });

  it('CrUX-absent fallback: shows "Lab data: LCP {lab_lcp}" instead of real-users row', () => {
    const out = renderPitchEmail({
      businessName: 'No Crux Co',
      pagespeed: {
        score: 50,
        flag: 'amber',
        metrics: { 'Largest Contentful Paint': '3.4s', CLS: 0.05 },
        categories: { performance: 50, accessibility: 80, bestPractices: 90, seo: 95 },
        // field deliberately omitted — low-traffic domain
      },
      securityGrade: 'B',
    });
    expect(out.html).not.toContain('Real users');
    expect(out.html).toContain('Lab data: LCP 3.4s');
    expect(out.text).toContain('Lab data: LCP 3.4s');
  });

  it('security-null omit: row spans remaining cells; no "Security grade" text', () => {
    const out = renderPitchEmail({
      businessName: 'No Security Co',
      pagespeed: {
        score: 60,
        flag: 'amber',
        categories: { performance: 60, accessibility: 70, bestPractices: 80, seo: 90 },
        field: { lcpMs: 2500 },
      },
      securityGrade: null,
    });
    expect(out.html).not.toContain('Security grade');
    // Summary row should span colspan=4 when grade is absent.
    expect(out.html).toMatch(/colspan="4"[^>]*>Real users \(28-day\)/);
    expect(out.text).not.toContain('Security grade');
    expect(out.text).toContain('Real users (28-day): LCP 2.5s');
  });

  it('plain-text mirrors the scorecard structure when categories present', () => {
    const out = renderPitchEmail(fullScorecardInputs);
    expect(out.text).toContain('Web audit');
    expect(out.text).toContain('Performance:');
    expect(out.text).toContain('Accessibility:');
    expect(out.text).toContain('Best Practices:');
    expect(out.text).toContain('SEO:');
    expect(out.text).toContain('34 / 100');
    expect(out.text).toContain('91 / 100');
    expect(out.text).toContain('Real users (28-day): LCP 6.2s');
    expect(out.text).toContain('Security grade: F');
  });

  it('scorecard placement: between issues bullet list and demo line', () => {
    const out = renderPitchEmail({
      ...fullScorecardInputs,
      demoUrl: 'https://pulse-demo.vedryxtech.com/acme',
    });
    const issuesIdx = out.html.indexOf('dragging it down');
    const cardIdx = out.html.indexOf('Web audit');
    const demoIdx = out.html.indexOf("here's the live version");
    expect(issuesIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(issuesIdx);
    expect(demoIdx).toBeGreaterThan(cardIdx);
  });

  it('HTML-escapes businessName inside the scorecard header', () => {
    const out = renderPitchEmail({
      businessName: '<script>alert(1)</script>',
      pagespeed: {
        score: 30,
        flag: 'red',
        categories: { performance: 30, accessibility: 40, bestPractices: 50, seo: 60 },
      },
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toContain('&lt;script&gt;');
  });
});

describe('renderPitchEmail — inline screenshot <img> attribute hygiene', () => {
  it('defaults alt to "screenshot N" (1-indexed) when input alt is missing or empty', () => {
    const out = renderPitchEmail({
      businessName: 'AltCo',
      pagespeed: { score: 50, flag: 'amber' },
      screenshots: [
        { url: 'https://blob.example/a.png' }, // alt missing
        { url: 'https://blob.example/b.png', alt: '' }, // alt empty
        { url: 'https://blob.example/c.png', alt: '   ' }, // alt whitespace-only
      ],
    });
    expect(out.html).toMatch(/<img[^>]*src="https:\/\/blob\.example\/a\.png"[^>]*alt="screenshot 1"/);
    expect(out.html).toMatch(/<img[^>]*src="https:\/\/blob\.example\/b\.png"[^>]*alt="screenshot 2"/);
    expect(out.html).toMatch(/<img[^>]*src="https:\/\/blob\.example\/c\.png"[^>]*alt="screenshot 3"/);
  });

  it('emits max-width:560px in the inline style and no width=/height= attributes', () => {
    const out = renderPitchEmail({
      businessName: 'MaxCo',
      pagespeed: { score: 50, flag: 'amber' },
      screenshots: [{ url: 'https://blob.example/a.png', alt: 'shot' }],
    });
    expect(out.html).toMatch(/<img[^>]*style="[^"]*max-width:560px/);
    expect(out.html).toMatch(/<img[^>]*style="[^"]*display:block/);
    // Explicit: no width= / height= attributes on any <img>.
    expect(out.html).not.toMatch(/<img[^>]*\swidth="/);
    expect(out.html).not.toMatch(/<img[^>]*\sheight="/);
  });

  it('HTML-escapes user-supplied alt text', () => {
    const out = renderPitchEmail({
      businessName: 'EscCo',
      pagespeed: { score: 50, flag: 'amber' },
      screenshots: [
        {
          url: 'https://blob.example/a.png',
          alt: '"><script>alert(1)</script>',
        },
      ],
    });
    // Raw payload not present.
    expect(out.html).not.toContain('"><script>alert(1)</script>');
    // The escaped form lives inside the alt attribute.
    expect(out.html).toMatch(/<img[^>]*alt="&quot;&gt;&lt;script&gt;/);
  });

  it('emits nothing (no <br><br>) when every screenshot URL is rejected by safeUrl', () => {
    // All screenshot URLs are hostile/non-http(s) → block emits nothing.
    const out = renderPitchEmail({
      businessName: 'AllBadCo',
      pagespeed: { score: 50, flag: 'amber' },
      screenshots: [
        { url: 'javascript:alert(1)' },
        { url: 'ftp://example.com/x.png' },
        { url: 'data:image/png;base64,iVBOR...' },
      ],
    });
    expect(out.html).not.toContain('<img');
    // Plain-text mirror also has no screenshot block.
    expect(out.text).not.toContain('Before/after shots');
  });
});

describe('From-header composition (send.ts)', () => {
  const CONFIGURED = 'Vedryx Pulse <hello@pulse.vedryxtech.com>';

  it('extracts the bare address from a display-named From', () => {
    expect(addressOf(CONFIGURED)).toBe('hello@pulse.vedryxtech.com');
    expect(addressOf('hello@pulse.vedryxtech.com')).toBe('hello@pulse.vedryxtech.com');
  });

  it('composes the SDR name over the verified address', () => {
    expect(composeFrom({ fromName: 'Dev Saini' }, CONFIGURED)).toBe(
      'Dev Saini <hello@pulse.vedryxtech.com>',
    );
  });

  it('explicit from wins; empty/absent name falls back to configured From', () => {
    expect(composeFrom({ from: 'X <x@y.com>', fromName: 'Dev' }, CONFIGURED)).toBe('X <x@y.com>');
    expect(composeFrom({}, CONFIGURED)).toBe(CONFIGURED);
  });

  it('sanitizes header-injection + RFC specials in the display name', () => {
    // angle brackets / quotes / CRLF stripped — no header injection. The
    // surviving @ and : are RFC specials, so the whole name gets quoted.
    expect(sanitizeDisplayName('Dev <evil@x.com>\r\nBcc: a@b.com')).toBe(
      '"Dev evil@x.comBcc: a@b.com"',
    );
    // a comma forces quoting so the header stays one address.
    expect(sanitizeDisplayName('Saini, Dev')).toBe('"Saini, Dev"');
    expect(composeFrom({ fromName: 'Saini, Dev' }, CONFIGURED)).toBe(
      '"Saini, Dev" <hello@pulse.vedryxtech.com>',
    );
  });
});
