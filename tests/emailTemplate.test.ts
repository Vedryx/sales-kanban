import { describe, expect, it } from 'vitest';
import { renderPitchEmail } from '../src/lib/email/template';

describe('renderPitchEmail — golden fixtures', () => {
  it('minimal: score + flag, no demo, no shots, no note', () => {
    const out = renderPitchEmail({
      businessName: "Sally's Salon",
      website: 'https://sallys.example.com',
      pagespeed: { score: 42, flag: 'red' },
    });
    // CMO subject variant A: "{biz} — your site scores {n}. We fixed it."
    expect(out.subject).toContain("Sally's Salon");
    expect(out.subject).toContain('42');
    expect(out.subject).toContain('We fixed it');
    expect(out.html).toContain("Sally&#39;s Salon");
    expect(out.html).toContain('42');
    expect(out.html).toContain('#c5594a'); // red flag color
    // No demo URL → fallback reply prompt, no hyperlinked demo line.
    expect(out.html).not.toContain('You can see the result here');
    expect(out.text).toContain('42/100');
    expect(out.text).toContain('(RED)');
  });

  it('full kitchen-sink: demo url + 2 screenshots + custom note + metrics', () => {
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
    // CMO body: "We rebuilt it. You can see the result here: {demoUrl}"
    expect(out.html).toContain('You can see the result here');
    expect(out.html).toContain('https://pulse-demo.vedryxtech.com/acme');
    expect(out.html).toContain('https://blob.example/a.png');
    expect(out.html).toContain('https://blob.example/b.png');
    expect(out.html).toContain('LCP');
    expect(out.html).toContain('4.1s');
    expect(out.html).toContain('Quick note about their pricing page.');
    expect(out.html).toContain('Dev S.');
    // CMO two-options close.
    expect(out.html).toContain('Take the code');
    expect(out.html).toContain('Let us run your tech');
    expect(out.text).toContain('Quick note about their pricing page.');
    expect(out.text).toContain('Take the code');
  });

  it('refuses javascript: URLs in demoUrl + screenshots', () => {
    const out = renderPitchEmail({
      businessName: 'Bad URL Co',
      website: 'https://x.example.com',
      pagespeed: { score: 30, flag: 'red' },
      demoUrl: 'javascript:alert(1)',
      screenshots: [{ url: 'data:image/png;base64,iVBOR...' }],
    });
    expect(out.html).not.toContain('javascript:');
    expect(out.html).not.toContain('data:image');
    // Hostile demo → fallback path, no "You can see the result here" line.
    expect(out.html).not.toContain('You can see the result here');
  });

  it('HTML-escapes user content in businessName + customNote', () => {
    const out = renderPitchEmail({
      businessName: '<script>alert(1)</script>',
      website: 'https://x.example.com',
      pagespeed: { score: 30, flag: 'red' },
      customNote: '"><img src=x onerror=alert(1)>',
    });
    // The literal markup must never appear unescaped.
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).not.toContain('<img src=x');
    // Escaped forms must appear.
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&quot;&gt;&lt;img');
  });

  it('produces a plain-text version', () => {
    const out = renderPitchEmail({
      businessName: 'Plain Text Co',
      pagespeed: { score: 80, flag: 'green' },
    });
    // Business name lives in the subject line, not the body (per CMO copy).
    expect(out.subject).toContain('Plain Text Co');
    expect(out.text).toContain('Vedryx Pulse');
    expect(out.text).toContain('80/100');
    // CMO opt-out line + formal unsubscribe mailto (CAN-SPAM/GDPR).
    expect(out.text).toContain("Not interested or wrong person");
    expect(out.text).toContain('mailto:unsubscribe@vedryxtech.com');
  });

  it('CAN-SPAM/GDPR footer: postal address placeholder + unsubscribe link', () => {
    const out = renderPitchEmail({
      businessName: 'Footer Co',
      pagespeed: { score: 50, flag: 'amber' },
    });
    // Postal address must be present in HTML and text, flagged TODO so the
    // founder swaps the registered business address before live send.
    expect(out.html).toContain('TODO_POSTAL_ADDRESS');
    expect(out.text).toContain('TODO_POSTAL_ADDRESS');
    // Real unsubscribe mailto in HTML and text fallback.
    expect(out.html).toContain('mailto:unsubscribe@vedryxtech.com');
    expect(out.text).toContain('mailto:unsubscribe@vedryxtech.com');
  });
});
