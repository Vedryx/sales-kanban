import { describe, it, expect } from 'vitest';
import { redactPhone, redactPII } from '../src/lib/privacy';

describe('redactPhone', () => {
  it('strips US (210) 927-1400', () => {
    expect(redactPhone('call (210) 927-1400 now')).toContain('[redacted-phone]');
  });
  it('strips intl +44 7700 900123', () => {
    expect(redactPhone('contact +44 7700 900123 plz')).toContain('[redacted-phone]');
  });
  it('strips dotted 555.555.5555', () => {
    expect(redactPhone('phone 555.555.5555 ok')).toContain('[redacted-phone]');
  });
  it('leaves short numbers alone', () => {
    expect(redactPhone('PS=33 score')).toBe('PS=33 score');
  });
});

describe('redactPII', () => {
  it('strips emails', () => {
    expect(redactPII('lisa@castor.com is in')).toContain('[redacted-email]');
  });
});
