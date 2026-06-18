import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from '../src/lib/access/allowlist';

describe('isAllowedEmail', () => {
  it('allows an email listed in allowlist.json', () => {
    expect(isAllowedEmail('dev@apxlabs.ai')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isAllowedEmail('  DEV@ApxLabs.AI ')).toBe(true);
  });

  it('rejects an email not in the allowlist', () => {
    expect(isAllowedEmail('stranger@example.com')).toBe(false);
  });

  it('rejects null/empty', () => {
    expect(isAllowedEmail(null)).toBe(false);
    expect(isAllowedEmail('')).toBe(false);
  });
});
