import { afterEach, describe, it, expect } from 'vitest';
import {
  applyFilterSort,
  hasActiveFilter,
  DEFAULT_FILTER_STATE,
  loadFilterState,
  type BoardFilterState,
} from '../src/lib/leads/boardFilters';
import type { LeadCard } from '../src/types/lead';

function lead(p: Partial<LeadCard> & { placeId: string; businessName: string }): LeadCard {
  return {
    stage: 'new',
    hasEmail: false,
    hasPitchEmailSent: false,
    ...p,
  } as LeadCard;
}

const LEADS: LeadCard[] = [
  lead({ placeId: 'a', businessName: 'Zebra Co', pagespeed: 80, pagespeedFlag: 'green', hasPitchEmailSent: true }),
  lead({ placeId: 'b', businessName: 'Apple Inc', pagespeed: 25, pagespeedFlag: 'red', hasPitchEmailSent: false, nextReminderAt: '2026-06-25', unreadReplyAt: '2026-06-24T06:00:00Z' }),
  lead({ placeId: 'c', businessName: 'Mango Ltd', pagespeed: 55, pagespeedFlag: 'amber', hasPitchEmailSent: true, nextReminderAt: '2026-06-24', unreadReplyAt: '2026-06-23T06:00:00Z', lastReadReplyAt: '2026-06-23T07:00:00Z' }),
  lead({ placeId: 'd', businessName: 'banana llc', hasPitchEmailSent: false }), // no score, no reminder
];

function state(patch: Partial<BoardFilterState>): BoardFilterState {
  return { ...DEFAULT_FILTER_STATE, ...patch };
}

describe('applyFilterSort — filtering', () => {
  it('default state returns all, sorted name A–Z (case-insensitive)', () => {
    const out = applyFilterSort(LEADS, DEFAULT_FILTER_STATE);
    expect(out.map((l) => l.placeId)).toEqual(['b', 'd', 'c', 'a']); // Apple, banana, Mango, Zebra
  });

  it('search matches businessName case-insensitively', () => {
    const out = applyFilterSort(LEADS, state({ search: 'an' })); // mAngo, bANana
    expect(out.map((l) => l.placeId).sort()).toEqual(['c', 'd']);
  });

  it('score flags filter to matching flags; no-flag cards excluded', () => {
    const out = applyFilterSort(LEADS, state({ scoreFlags: ['red', 'amber'] }));
    expect(out.map((l) => l.placeId).sort()).toEqual(['b', 'c']);
  });

  it('pitch=sent keeps only pitched', () => {
    const out = applyFilterSort(LEADS, state({ pitch: 'sent' }));
    expect(out.map((l) => l.placeId).sort()).toEqual(['a', 'c']);
  });

  it('pitch=not_sent keeps only un-pitched', () => {
    const out = applyFilterSort(LEADS, state({ pitch: 'not_sent' }));
    expect(out.map((l) => l.placeId).sort()).toEqual(['b', 'd']);
  });

  it('unreadOnly keeps only cards with a genuinely unread reply', () => {
    // b: unread (no read ts). c: read after reply → NOT unread.
    const out = applyFilterSort(LEADS, state({ unreadOnly: true }));
    expect(out.map((l) => l.placeId)).toEqual(['b']);
  });
});

describe('applyFilterSort — sorting', () => {
  it('worst_score: lowest first, no-score last', () => {
    const out = applyFilterSort(LEADS, state({ sort: 'worst_score' }));
    expect(out.map((l) => l.placeId)).toEqual(['b', 'c', 'a', 'd']); // 25,55,80,none
  });

  it('reminder_soonest: soonest first, none last', () => {
    const out = applyFilterSort(LEADS, state({ sort: 'reminder_soonest' }));
    expect(out.map((l) => l.placeId).slice(0, 2)).toEqual(['c', 'b']); // 06-24, 06-25
  });

  it('recently_replied: newest reply first', () => {
    const out = applyFilterSort(LEADS, state({ sort: 'recently_replied' }));
    expect(out[0].placeId).toBe('b'); // 06-24 reply beats c's 06-23
  });

  it('does not mutate the input array', () => {
    const copy = [...LEADS];
    applyFilterSort(LEADS, state({ sort: 'worst_score' }));
    expect(LEADS).toEqual(copy);
  });
});

describe('hasActiveFilter', () => {
  it('false for default, true once any filter set', () => {
    expect(hasActiveFilter(DEFAULT_FILTER_STATE)).toBe(false);
    expect(hasActiveFilter(state({ search: 'x' }))).toBe(true);
    expect(hasActiveFilter(state({ scoreFlags: ['red'] }))).toBe(true);
    expect(hasActiveFilter(state({ unreadOnly: true }))).toBe(true);
    // sort alone is NOT an active filter (never hides cards)
    expect(hasActiveFilter(state({ sort: 'worst_score' }))).toBe(false);
  });
});

describe('loadFilterState — legacy sort-key migration', () => {
  const originalWindow = globalThis.window;
  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error — undo test shim
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  function withStorage(raw: string) {
    const store = new Map<string, string>();
    if (raw) store.set('sk_board_filters_v1', raw);
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    };
  }

  it('migrates legacy sort:"next_action" to sort:"reminder_soonest"', () => {
    withStorage(JSON.stringify({ sort: 'next_action' }));
    const s = loadFilterState();
    expect(s.sort).toBe('reminder_soonest');
  });

  it('accepts a valid sort as-is', () => {
    withStorage(JSON.stringify({ sort: 'worst_score' }));
    const s = loadFilterState();
    expect(s.sort).toBe('worst_score');
  });

  it('falls back to default sort when the stored key is unknown', () => {
    withStorage(JSON.stringify({ sort: 'total_garbage' }));
    const s = loadFilterState();
    expect(s.sort).toBe(DEFAULT_FILTER_STATE.sort);
  });
});
