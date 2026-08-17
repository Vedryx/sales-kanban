import type { LeadCard } from '@/types/lead';
import { isUnreadReply } from './unread';
import { UNASSIGNED_KEY, sectionKeyOf } from './sectionGrouping';

// Client-side filter + sort for the board. Cards are already fully loaded
// (getBoardLeads), so every filter/sort here is in-memory and instant — no
// API round-trips. State is small + JSON-serialisable so the Board can persist
// it to localStorage and restore on refresh.

export type ScoreFlag = 'red' | 'amber' | 'green';
export type PitchStatus = 'all' | 'sent' | 'not_sent';
// `reminder_soonest` replaces the retired `next_action` sort. Legacy
// localStorage values carrying `next_action` are migrated in loadFilterState
// so a stale browser doesn't crash on a value not in SORT_LABELS.
export type SortKey = 'name_asc' | 'worst_score' | 'recently_replied' | 'reminder_soonest';

// Grouping mode. Not a filter — sits alongside filters/sort but has different
// semantics: it never hides cards, only rearranges them into swimlanes. See
// cto.md §2.5 for the intentional decoupling from `hasActiveFilter` +
// `clearFilters`.
export type GroupBy = 'none' | 'section';

export type BoardFilterState = {
  search: string;
  // Empty array = no score filter (show all, including cards with no flag).
  // Non-empty = card's pagespeedFlag must be in the set; cards with no flag
  // are excluded while any flag filter is active.
  scoreFlags: ScoreFlag[];
  pitch: PitchStatus;
  unreadOnly: boolean;
  // '' = all verticals (default). Otherwise a strict string-equal match on
  // LeadCard.vertical — cards with no vertical are excluded while active.
  vertical: string;
  // '' = all sections (default). '__unassigned__' sentinel = cards with no
  // section set. Otherwise a canonical-form section string; matched
  // case-insensitively against a normalized key derived from LeadCard.section
  // (see sectionKeyOf). Independent of `vertical` — two dimensions, two
  // filters, never merged (cto.md §2.1).
  section: string;
  sort: SortKey;
  // Grouping mode. See GroupBy comment above.
  groupBy: GroupBy;
};

export const DEFAULT_FILTER_STATE: BoardFilterState = {
  search: '',
  scoreFlags: [],
  pitch: 'all',
  unreadOnly: false,
  vertical: '',
  section: '',
  sort: 'name_asc',
  groupBy: 'none',
};

export const SORT_LABELS: Record<SortKey, string> = {
  name_asc: 'Name A–Z',
  worst_score: 'Worst score first',
  recently_replied: 'Recently replied',
  reminder_soonest: 'Reminder soonest',
};

// True when any filter is narrowing the set (search/score/pitch/unread/
// vertical/section). Sort alone is not a "filter" — it never hides cards.
// `groupBy` is deliberately excluded (see cto.md §2.5): grouping rearranges
// but never hides, so it never surfaces the Clear chip and is preserved
// across Clear (same rule as `sort`). Drives the Clear button.
export function hasActiveFilter(s: BoardFilterState): boolean {
  return (
    s.search.trim() !== '' ||
    s.scoreFlags.length > 0 ||
    s.pitch !== 'all' ||
    s.unreadOnly ||
    s.vertical !== '' ||
    s.section !== ''
  );
}

// Most recent reply timestamp on a card (read or unread), for sort/recency.
function latestReplyTs(l: LeadCard): number {
  const a = l.unreadReplyAt ? Date.parse(l.unreadReplyAt) : NaN;
  const b = l.lastReadReplyAt ? Date.parse(l.lastReadReplyAt) : NaN;
  const ma = Number.isFinite(a) ? a : -Infinity;
  const mb = Number.isFinite(b) ? b : -Infinity;
  return Math.max(ma, mb);
}

// Reminder date coerced to a millis-since-epoch. YYYY-MM-DD strings sort
// correctly on their own, but we materialize numbers here so the shared
// "missing → Infinity → last" pattern matches the other comparators.
function reminderMs(l: LeadCard): number {
  const raw = l.nextReminderAt;
  if (!raw) return Infinity;
  const parsed = Date.parse(raw.length === 10 ? `${raw}T00:00:00` : raw);
  return Number.isFinite(parsed) ? parsed : Infinity;
}

function matchesFilter(l: LeadCard, s: BoardFilterState): boolean {
  const q = s.search.trim().toLowerCase();
  if (q && !l.businessName.toLowerCase().includes(q)) return false;

  if (s.scoreFlags.length > 0) {
    if (!l.pagespeedFlag || !s.scoreFlags.includes(l.pagespeedFlag)) return false;
  }

  if (s.pitch === 'sent' && !l.hasPitchEmailSent) return false;
  if (s.pitch === 'not_sent' && l.hasPitchEmailSent) return false;

  if (s.unreadOnly && !isUnreadReply(l)) return false;

  // Vertical: exact match; cards with no vertical are excluded while active.
  if (s.vertical !== '' && l.vertical !== s.vertical) return false;

  // Section: matched against the normalized key so casing / whitespace drift
  // never splits a lane in half. '' = all sections; '__unassigned__' keeps
  // only leads with no section.
  if (s.section !== '') {
    const cardKey = sectionKeyOf(l.section);
    if (s.section === UNASSIGNED_KEY) {
      if (cardKey !== UNASSIGNED_KEY) return false;
    } else {
      const filterKey = s.section.trim().toLowerCase();
      if (cardKey !== filterKey) return false;
    }
  }

  return true;
}

// Comparator per sort key. All comparators are total + stable-friendly:
// missing values sort LAST so a sparse field never floats junk to the top.
function comparator(sort: SortKey): (a: LeadCard, b: LeadCard) => number {
  switch (sort) {
    case 'worst_score':
      return (a, b) => {
        const av = a.pagespeed ?? Infinity;
        const bv = b.pagespeed ?? Infinity;
        return av - bv;
      };
    case 'recently_replied':
      return (a, b) => latestReplyTs(b) - latestReplyTs(a);
    case 'reminder_soonest':
      return (a, b) => reminderMs(a) - reminderMs(b);
    case 'name_asc':
    default:
      return (a, b) => a.businessName.localeCompare(b.businessName);
  }
}

// Filter then sort. Returns a new array; never mutates the input. The sort is
// applied across the full set — the Board re-buckets the result into columns,
// so order is preserved within each column.
export function applyFilterSort(leads: LeadCard[], s: BoardFilterState): LeadCard[] {
  const filtered = leads.filter((l) => matchesFilter(l, s));
  // Tie-break on name so equal keys render in a stable, predictable order.
  const cmp = comparator(s.sort);
  return filtered.slice().sort((a, b) => {
    const primary = cmp(a, b);
    return primary !== 0 ? primary : a.businessName.localeCompare(b.businessName);
  });
}

const STORAGE_KEY = 'sk_board_filters_v1';

export function loadFilterState(): BoardFilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTER_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTER_STATE;
    // Widen the sort key to `unknown` at parse time so we can migrate legacy
    // string values (e.g. the retired `next_action` key) without TS
    // narrowing them away.
    const parsed = JSON.parse(raw) as Omit<Partial<BoardFilterState>, 'sort'> & {
      sort?: unknown;
    };
    // Merge over defaults so a schema bump (new field) never yields undefined.
    // Sort key migration: legacy `next_action` collapses onto its successor
    // `reminder_soonest`; any other unknown value falls back to the default.
    const migratedSort: SortKey = (() => {
      const s = parsed.sort;
      if (typeof s !== 'string') return DEFAULT_FILTER_STATE.sort;
      if (s === 'next_action') return 'reminder_soonest';
      if (s in SORT_LABELS) return s as SortKey;
      return DEFAULT_FILTER_STATE.sort;
    })();
    return {
      ...DEFAULT_FILTER_STATE,
      ...parsed,
      sort: migratedSort,
      // Defensive: ensure scoreFlags is an array of valid flags.
      scoreFlags: Array.isArray(parsed.scoreFlags)
        ? parsed.scoreFlags.filter((f): f is ScoreFlag => f === 'red' || f === 'amber' || f === 'green')
        : [],
      // Defensive: vertical must be a string; anything else → '' (all).
      vertical: typeof parsed.vertical === 'string' ? parsed.vertical : '',
      // Defensive: section must be a string; anything else → '' (all).
      section: typeof parsed.section === 'string' ? parsed.section : '',
      // Defensive: groupBy is a small enum; only 'section' flips it on.
      // Anything unknown (including legacy state that omits the field) →
      // 'none' so legacy boards render exactly as before.
      groupBy: parsed.groupBy === 'section' ? 'section' : 'none',
    };
  } catch {
    return DEFAULT_FILTER_STATE;
  }
}

export function saveFilterState(s: BoardFilterState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota / private-mode — non-fatal; filters just won't persist.
  }
}
