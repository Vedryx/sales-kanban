import { describe, expect, it } from 'vitest';
import {
  bareEmail,
  sanitizeInboundHtml,
  snippetFromText,
  stripAngles,
} from '@/lib/email/sanitizeInbound';

describe('sanitizeInboundHtml', () => {
  it('strips <script> tags', () => {
    const out = sanitizeInboundHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toMatch(/script/i);
    expect(out).toContain('<p>hi</p>');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeInboundHtml('<a href="https://x.test" onclick="alert(1)">go</a>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).toMatch(/href="https:\/\/x\.test"/);
  });

  it('strips <img> entirely (no tracking pixels)', () => {
    const out = sanitizeInboundHtml('<p>hello <img src="https://t.test/p.gif" /></p>');
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain('hello');
  });

  it('strips <style> tags + style attributes', () => {
    const out = sanitizeInboundHtml(
      '<style>body{background:url(javascript:alert(1))}</style><p style="color:red">x</p>',
    );
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toMatch(/style=/i);
    expect(out).toContain('x');
  });

  it('forces target=_blank + rel on surviving anchors', () => {
    const out = sanitizeInboundHtml('<a href="https://x.test">y</a>');
    expect(out).toMatch(/target="_blank"/);
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeInboundHtml(null)).toBe('');
    expect(sanitizeInboundHtml(undefined)).toBe('');
  });
});

describe('snippetFromText', () => {
  it('caps at 500 by default', () => {
    const s = 'a'.repeat(1000);
    expect(snippetFromText(s).length).toBe(500);
  });
  it('trims leading whitespace', () => {
    expect(snippetFromText('   hello world  ')).toBe('hello world');
  });
  it('handles empty', () => {
    expect(snippetFromText('')).toBe('');
    expect(snippetFromText(null)).toBe('');
  });
});

describe('bareEmail', () => {
  it('extracts from "Name <addr@x.com>"', () => {
    expect(bareEmail('Foo Bar <a@b.com>')).toBe('a@b.com');
  });
  it('passes through a bare address', () => {
    expect(bareEmail('a@b.com')).toBe('a@b.com');
  });
  it('lowercases', () => {
    expect(bareEmail('A@B.COM')).toBe('a@b.com');
  });
  it('handles empty', () => {
    expect(bareEmail('')).toBe('');
    expect(bareEmail(null)).toBe('');
  });
});

describe('stripAngles', () => {
  it('strips outer < >', () => {
    expect(stripAngles('<abc@server>')).toBe('abc@server');
  });
  it('passes through bare', () => {
    expect(stripAngles('abc@server')).toBe('abc@server');
  });
  it('handles empty', () => {
    expect(stripAngles('')).toBe('');
    expect(stripAngles(null)).toBe('');
  });
});
