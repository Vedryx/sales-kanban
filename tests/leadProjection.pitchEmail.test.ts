import { describe, expect, it } from 'vitest';
import { toCard, toDetail } from '../src/lib/leadProjection';

describe('leadProjection — pitch email fields', () => {
  it('hasEmail = true when only valid_pulse_leads.email present (no override)', () => {
    const card = toCard({
      placeId: 'p1',
      name: 'Biz One',
      email: 'lead@example.com',
    });
    expect(card.hasEmail).toBe(true);
    expect(card.hasPitchEmailSent).toBe(false);
  });

  it('hasEmail = true when sdr override present (raw missing)', () => {
    const card = toCard({
      placeId: 'p2',
      name: 'Biz Two',
      state_data: { email: 'override@example.com' },
    });
    expect(card.hasEmail).toBe(true);
  });

  it('explicit null override clears even if raw has email', () => {
    const card = toCard({
      placeId: 'p3',
      name: 'Biz Three',
      email: 'raw@example.com',
      state_data: { email: null },
    });
    expect(card.hasEmail).toBe(false);
  });

  it('detail returns effective email (override wins)', () => {
    const detail = toDetail({
      placeId: 'p4',
      name: 'Biz Four',
      email: 'raw@example.com',
      state_data: { email: 'override@example.com' },
    });
    expect(detail.email).toBe('override@example.com');
  });

  it('hasPitchEmailSent reflects pitchEmailSentAt presence', () => {
    const card = toCard({
      placeId: 'p5',
      name: 'Biz Five',
      state_data: { pitchEmailSentAt: '2026-06-19T10:00:00.000Z' },
    });
    expect(card.hasPitchEmailSent).toBe(true);
  });

  it('card never leaks raw email value, only the boolean', () => {
    const card = toCard({
      placeId: 'p6',
      name: 'Biz Six',
      email: 'pii@example.com',
    });
    // The card type forbids `email`; existence flag only.
    expect((card as unknown as { email?: string }).email).toBeUndefined();
  });
});
