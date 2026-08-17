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

  it('section counts as active; groupBy does NOT', () => {
    // Section narrowing hides cards → active.
    expect(hasActiveFilter(state({ section: 'Dental' }))).toBe(true);
    expect(hasActiveFilter(state({ section: '__unassigned__' }))).toBe(true);
    // Grouping never hides cards; the blue border is a mode indicator,
    // not a filter chip. hasActiveFilter must not surface Clear for it.
    expect(hasActiveFilter(state({ groupBy: 'section' }))).toBe(false);
    // Both together: only section flips it on.
    expect(hasActiveFilter(state({ section: '', groupBy: 'section' }))).toBe(false);
  });
});

describe('applyFilterSort — section filter', () => {
  const SECTION_LEADS: LeadCard[] = [
    lead({ placeId: 's1', businessName: 'Dental A', section: 'Dental' }),
    lead({ placeId: 's2', businessName: 'Dental B', section: 'dental' }), // case drift
    lead({ placeId: 's3', businessName: 'HVAC A', section: ' HVAC ' }), // whitespace drift
    lead({ placeId: 's4', businessName: 'Unsectioned', section: null }),
    lead({ placeId: 's5', businessName: 'Also unsectioned' }), // missing section
  ];

  it('empty section value → all pass through', () => {
    const out = applyFilterSort(SECTION_LEADS, state({ section: '' }));
    expect(out.map((l) => l.placeId).sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('canonical section filter matches case-insensitively', () => {
    const out = applyFilterSort(SECTION_LEADS, state({ section: 'Dental' }));
    expect(out.map((l) => l.placeId).sort()).toEqual(['s1', 's2']);
  });

  it('lower-case filter still matches (normalized on both sides)', () => {
    const out = applyFilterSort(SECTION_LEADS, state({ section: 'dental' }));
    expect(out.map((l) => l.placeId).sort()).toEqual(['s1', 's2']);
  });

  it('whitespace-padded section on a card still matches the trimmed key', () => {
    const out = applyFilterSort(SECTION_LEADS, state({ section: 'HVAC' }));
    expect(out.map((l) => l.placeId)).toEqual(['s3']);
  });

  it('__unassigned__ sentinel keeps only leads with no section', () => {
    const out = applyFilterSort(SECTION_LEADS, state({ section: '__unassigned__' }));
    expect(out.map((l) => l.placeId).sort()).toEqual(['s4', 's5']);
  });

  it('composes with vertical filter (AND-conjunctive)', () => {
    const mixed: LeadCard[] = [
      lead({ placeId: 'm1', businessName: 'One', section: 'Dental', vertical: 'dentist' }),
      lead({ placeId: 'm2', businessName: 'Two', section: 'Dental', vertical: 'lawyer' }),
      lead({ placeId: 'm3', businessName: 'Three', section: 'HVAC', vertical: 'dentist' }),
    ];
    const out = applyFilterSort(
      mixed,
      state({ section: 'Dental', vertical: 'dentist' }),
    );
    expect(out.map((l) => l.placeId)).toEqual(['m1']);
  });

  it('composes with score flag filter', () => {
    const mixed: LeadCard[] = [
      lead({
        placeId: 'g1',
        businessName: 'One',
        section: 'Dental',
        pagespeed: 20,
        pagespeedFlag: 'red',
      }),
      lead({
        placeId: 'g2',
        businessName: 'Two',
        section: 'Dental',
        pagespeed: 90,
        pagespeedFlag: 'green',
      }),
    ];
    const out = applyFilterSort(
      mixed,
      state({ section: 'Dental', scoreFlags: ['red'] }),
    );
    expect(out.map((l) => l.placeId)).toEqual(['g1']);
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

  it('legacy state without section/groupBy hydrates to defaults', () => {
    withStorage(JSON.stringify({ sort: 'worst_score' }));
    const s = loadFilterState();
    expect(s.section).toBe('');
    expect(s.groupBy).toBe('none');
    // Other fields untouched.
    expect(s.sort).toBe('worst_score');
  });

  it('accepts valid section string; rejects non-string as empty', () => {
    withStorage(JSON.stringify({ section: 'Dental' }));
    expect(loadFilterState().section).toBe('Dental');

    withStorage(JSON.stringify({ section: 42 }));
    expect(loadFilterState().section).toBe('');

    withStorage(JSON.stringify({ section: null }));
    expect(loadFilterState().section).toBe('');
  });

  it('accepts groupBy=section; anything else → none', () => {
    withStorage(JSON.stringify({ groupBy: 'section' }));
    expect(loadFilterState().groupBy).toBe('section');

    withStorage(JSON.stringify({ groupBy: 'garbage' }));
    expect(loadFilterState().groupBy).toBe('none');

    withStorage(JSON.stringify({ groupBy: null }));
    expect(loadFilterState().groupBy).toBe('none');
  });
});
