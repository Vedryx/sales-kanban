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

  it('full: demo url + 2 screenshots + custom note + metrics', () => {
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
    // Screenshots are text links, not inline <img>.
    expect(out.html).not.toContain('<img');
    expect(out.html).toContain('https://blob.example/a.png');
    expect(out.html).toContain('https://blob.example/b.png');
    expect(out.html).toContain('shot 1');
    expect(out.html).toContain('shot 2');
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
    expect(out.text).toContain('pulse.vedryxtech.com');
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
