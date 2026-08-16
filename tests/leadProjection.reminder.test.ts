import { describe, expect, it } from 'vitest';
import { toCard, toDetail } from '../src/lib/leadProjection';

describe('leadProjection — nextReminderAt fallback', () => {
  it('prefers state_data.nextReminderAt when set', () => {
    const card = toCard({
      placeId: 'p1',
      name: 'Acme Co',
      state_data: {
        stage: 'new',
        nextReminderAt: '2026-08-20',
        nextActionAt: new Date('2020-01-01T00:00:00Z').toISOString(),
      },
    });
    expect(card.nextReminderAt).toBe('2026-08-20');
  });

  it('falls back to a day-coerced nextActionAt when nextReminderAt is absent', () => {
    const card = toCard({
      placeId: 'p2',
      name: 'Beta Co',
      state_data: {
        stage: 'new',
        nextActionAt: new Date('2026-08-17T15:30:00').toISOString(),
      },
    });
    expect(card.nextReminderAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns null when neither field is set', () => {
    const card = toCard({
      placeId: 'p3',
      name: 'Gamma Co',
      state_data: { stage: 'new' },
    });
    expect(card.nextReminderAt).toBe(null);
  });
});

describe('leadProjection — legacy-note synthesis', () => {
  it('synthesizes a legacy-note entry when lastNote is populated and no import exists', () => {
    const detail = toDetail({
      placeId: 'p4',
      name: 'Delta Co',
      state_data: {
        stage: 'new',
        lastNote: 'Owner said email a proposal by Friday.',
        updatedAt: '2026-08-10T14:00:00.000Z',
      },
    });
    expect(detail.meetingSummaries).toBeDefined();
    expect(detail.meetingSummaries).toHaveLength(1);
    const [entry] = detail.meetingSummaries!;
    expect(entry.by).toBe('legacy-note');
    expect(entry.text).toBe('Owner said email a proposal by Friday.');
    expect(entry.at).toBe('2026-08-10T14:00:00.000Z');
    expect(entry.id).toBe('legacy-note');
  });

  it('does NOT synthesize when a legacy-note import already exists', () => {
    const detail = toDetail({
      placeId: 'p5',
      name: 'Epsilon Co',
      state_data: {
        stage: 'new',
        lastNote: 'Should be ignored',
        updatedAt: '2026-08-10T14:00:00.000Z',
        meetingSummaries: [
          {
            id: 'legacy-existing',
            by: 'legacy-note',
            at: '2026-08-01T00:00:00.000Z',
            text: 'imported already',
          },
        ],
      },
    });
    expect(detail.meetingSummaries).toHaveLength(1);
    expect(detail.meetingSummaries![0].text).toBe('imported already');
  });

  it('sorts summaries newest-first including the synthesized legacy entry', () => {
    const detail = toDetail({
      placeId: 'p6',
      name: 'Zeta Co',
      state_data: {
        stage: 'new',
        lastNote: 'legacy',
        updatedAt: '2026-08-15T00:00:00.000Z',
        meetingSummaries: [
          {
            id: 's-1',
            by: 'sdr@vedryx.com',
            at: '2026-08-17T00:00:00.000Z',
            text: 'fresh',
          },
          {
            id: 's-2',
            by: 'sdr@vedryx.com',
            at: '2026-08-01T00:00:00.000Z',
            text: 'older',
          },
        ],
      },
    });
    const ordered = detail.meetingSummaries!.map((m) => m.id);
    expect(ordered[0]).toBe('s-1'); // newest
    expect(ordered.includes('legacy-note')).toBe(true);
    expect(ordered[ordered.length - 1]).toBe('s-2'); // oldest
  });
});

describe('leadProjection — latestMeetingSummary preview', () => {
  it('truncates long text with an ellipsis at 140 chars', () => {
    const long = 'a'.repeat(500);
    const card = toCard({
      placeId: 'p7',
      name: 'Truncate Co',
      state_data: {
        stage: 'new',
        meetingSummaries: [
          {
            id: 's-long',
            by: 'sdr@vedryx.com',
            at: '2026-08-17T00:00:00.000Z',
            text: long,
          },
        ],
      },
    });
    expect(card.latestMeetingSummary).not.toBeNull();
    expect(card.latestMeetingSummary!.text.length).toBeLessThanOrEqual(140);
    expect(card.latestMeetingSummary!.text.endsWith('…')).toBe(true);
  });

  it('returns null when there are no summaries', () => {
    const card = toCard({
      placeId: 'p8',
      name: 'Empty Co',
      state_data: { stage: 'new' },
    });
    expect(card.latestMeetingSummary).toBeNull();
  });

  it('surfaces the legacy-note as the latestMeetingSummary when it is the newest', () => {
    const card = toCard({
      placeId: 'p9',
      name: 'Only Legacy Co',
      state_data: {
        stage: 'new',
        lastNote: 'legacy only',
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
    });
    expect(card.latestMeetingSummary).not.toBeNull();
    expect(card.latestMeetingSummary!.by).toBe('legacy-note');
    expect(card.latestMeetingSummary!.text).toBe('legacy only');
  });
});
