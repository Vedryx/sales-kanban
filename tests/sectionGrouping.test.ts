import { afterEach, describe, expect, it } from 'vitest';
import {
  UNASSIGNED_KEY,
  UNASSIGNED_LABEL,
  canonicalizeSection,
  deriveSectionOptions,
  groupLeadsBySection,
  loadLaneCollapse,
  saveLaneCollapse,
  sectionKeyOf,
} from '../src/lib/leads/sectionGrouping';
import type { LeadCard } from '../src/types/lead';

function lead(p: Partial<LeadCard> & { placeId: string; businessName: string }): LeadCard {
  return {
    stage: 'new',
    hasEmail: false,
    hasPitchEmailSent: false,
    ...p,
  } as LeadCard;
}

describe('sectionKeyOf', () => {
  it('normalizes casing + whitespace to a single key', () => {
    expect(sectionKeyOf('Dental')).toBe('dental');
    expect(sectionKeyOf('dental')).toBe('dental');
    expect(sectionKeyOf(' dental ')).toBe('dental');
    expect(sectionKeyOf('DENTAL')).toBe('dental');
  });

  it('empty / null / undefined all collapse to the Unassigned sentinel', () => {
    expect(sectionKeyOf(null)).toBe(UNASSIGNED_KEY);
    expect(sectionKeyOf(undefined)).toBe(UNASSIGNED_KEY);
    expect(sectionKeyOf('')).toBe(UNASSIGNED_KEY);
    expect(sectionKeyOf('   ')).toBe(UNASSIGNED_KEY);
  });
});

describe('deriveSectionOptions', () => {
  it('dedupes by normalized key and keeps first-seen exact form', () => {
    const leads = [
      lead({ placeId: 'a', businessName: 'A', section: 'Dental' }),
      lead({ placeId: 'b', businessName: 'B', section: 'dental' }),
      lead({ placeId: 'c', businessName: 'C', section: ' dental ' }),
      lead({ placeId: 'd', businessName: 'D', section: 'HVAC' }),
    ];
    // "Dental" is first-seen; "dental" / " dental " must not add duplicates.
    expect(deriveSectionOptions(leads)).toEqual(['Dental', 'HVAC']);
  });

  it('ignores null / empty sections', () => {
    const leads = [
      lead({ placeId: 'a', businessName: 'A', section: null }),
      lead({ placeId: 'b', businessName: 'B', section: '' }),
      lead({ placeId: 'c', businessName: 'C' }), // missing
      lead({ placeId: 'd', businessName: 'D', section: 'HVAC' }),
    ];
    expect(deriveSectionOptions(leads)).toEqual(['HVAC']);
  });

  it('sorts alphabetically case-insensitively', () => {
    const leads = [
      lead({ placeId: 'a', businessName: 'A', section: 'zeta' }),
      lead({ placeId: 'b', businessName: 'B', section: 'Alpha' }),
      lead({ placeId: 'c', businessName: 'C', section: 'beta' }),
    ];
    expect(deriveSectionOptions(leads)).toEqual(['Alpha', 'beta', 'zeta']);
  });
});

describe('groupLeadsBySection', () => {
  it('groups by normalized key and pins Unassigned last', () => {
    const leads = [
      lead({ placeId: 'a', businessName: 'A', section: 'HVAC' }),
      lead({ placeId: 'b', businessName: 'B', section: null }),
      lead({ placeId: 'c', businessName: 'C', section: 'Dental' }),
      lead({ placeId: 'd', businessName: 'D', section: 'dental' }),
      lead({ placeId: 'e', businessName: 'E' }), // no section
    ];
    const groups = groupLeadsBySection(leads);
    expect(groups.map((g) => g.label)).toEqual(['Dental', 'HVAC', UNASSIGNED_LABEL]);
    // Dental group contains BOTH "Dental" and "dental" cards; canonical
    // label is the first-seen exact form ("Dental").
    const dental = groups.find((g) => g.label === 'Dental')!;
    expect(dental.leads.map((l) => l.placeId).sort()).toEqual(['c', 'd']);
    // Unassigned contains both null + missing.
    const un = groups.find((g) => g.key === UNASSIGNED_KEY)!;
    expect(un.leads.map((l) => l.placeId).sort()).toEqual(['b', 'e']);
  });

  it('returns only the Unassigned group when no card has a section', () => {
    const leads = [
      lead({ placeId: 'a', businessName: 'A' }),
      lead({ placeId: 'b', businessName: 'B', section: null }),
    ];
    const groups = groupLeadsBySection(leads);
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe(UNASSIGNED_KEY);
  });

  it('omits Unassigned when every card is sectioned', () => {
    const leads = [
      lead({ placeId: 'a', businessName: 'A', section: 'Dental' }),
      lead({ placeId: 'b', businessName: 'B', section: 'HVAC' }),
    ];
    const groups = groupLeadsBySection(leads);
    expect(groups.map((g) => g.key)).toEqual(['dental', 'hvac']);
  });

  it('canonical label is the first-seen exact form even if a later variant differs', () => {
    const leads = [
      lead({ placeId: 'a', businessName: 'A', section: '  dental  ' }), // trims + first
      lead({ placeId: 'b', businessName: 'B', section: 'DENTAL' }),
    ];
    const groups = groupLeadsBySection(leads);
    // First-seen trims to "dental" — that's the canonical label.
    expect(groups[0].label).toBe('dental');
  });
});

describe('canonicalizeSection', () => {
  it('swaps typed value onto the existing canonical when case-insensitively matched', () => {
    expect(canonicalizeSection('dental', ['Dental', 'HVAC'])).toBe('Dental');
    expect(canonicalizeSection(' HVAC ', ['Dental', 'HVAC'])).toBe('HVAC');
  });

  it('returns the trimmed input unchanged when no match', () => {
    expect(canonicalizeSection('Roofing', ['Dental', 'HVAC'])).toBe('Roofing');
    expect(canonicalizeSection('  Roofing  ', ['Dental', 'HVAC'])).toBe('Roofing');
  });

  it('empty input stays empty (blur commits null)', () => {
    expect(canonicalizeSection('', ['Dental'])).toBe('');
    expect(canonicalizeSection('   ', ['Dental'])).toBe('');
  });
});

describe('lane-collapse localStorage helpers', () => {
  const originalWindow = globalThis.window;
  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error — undo test shim
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  function withStorage(raw: string | null) {
    const store = new Map<string, string>();
    if (raw != null) store.set('sk_board_lane_collapse_v1', raw);
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    };
  }

  it('loads a valid collapse map', () => {
    withStorage(JSON.stringify({ dental: true, hvac: true }));
    expect(loadLaneCollapse()).toEqual({ dental: true, hvac: true });
  });

  it('drops non-true values defensively', () => {
    withStorage(JSON.stringify({ dental: true, hvac: false, junk: 'yes' }));
    expect(loadLaneCollapse()).toEqual({ dental: true });
  });

  it('returns empty on missing / malformed payload', () => {
    withStorage(null);
    expect(loadLaneCollapse()).toEqual({});
    withStorage('not json');
    expect(loadLaneCollapse()).toEqual({});
    withStorage(JSON.stringify(null));
    expect(loadLaneCollapse()).toEqual({});
  });

  it('save round-trips through load', () => {
    withStorage(null);
    saveLaneCollapse({ dental: true });
    expect(loadLaneCollapse()).toEqual({ dental: true });
  });
});
