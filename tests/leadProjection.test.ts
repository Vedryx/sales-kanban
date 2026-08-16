import { describe, expect, it } from 'vitest';
import { toCard, toDetail } from '../src/lib/leadProjection';

const lifecycleState = {
  _id: 'state-doc',
  leadPlaceId: 'castor-dental-care',
  createdAt: '2026-06-17T00:00:00.000Z',
  stage: 'connected' as const,
  updatedAt: '2026-06-17T01:00:00.000Z',
  updatedBy: 'sdr@example.com',
  lastNote: 'Asked for pricing.',
};

describe('leadProjection', () => {
  it('does not expose lifecycle state objects as geographic state on cards', () => {
    const card = toCard({
      placeId: 'castor-dental-care',
      name: 'Castor Dental Care',
      city: 'San Antonio',
      state: lifecycleState,
      state_data: lifecycleState,
      email: 'lead@example.com',
    });

    expect(card.businessName).toBe('Castor Dental Care');
    expect(card.city).toBe('San Antonio');
    expect(card.state).toBeUndefined();
    expect(card.stage).toBe('connected');
    // lastNote is retired from the card projection; the legacy note now
    // surfaces via `latestMeetingSummary` with the sentinel `by: legacy-note`.
    expect(card.latestMeetingSummary).not.toBeNull();
    expect(card.latestMeetingSummary!.by).toBe('legacy-note');
    expect(card.latestMeetingSummary!.text).toBe('Asked for pricing.');
  });

  it('keeps normal geographic state values on detail projections', () => {
    const detail = toDetail({
      placeId: 'ismile-dental-team',
      name: 'iSmile Dental Team',
      city: 'Austin',
      state: 'TX',
      phone: '(210) 555-0199',
    });

    expect(detail.state).toBe('TX');
    expect(detail.phone).toBe('(210) 555-0199');
  });
});
