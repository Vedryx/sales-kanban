import type { LeadCard } from '@/types/lead';

// Section handling — human-set taxonomy tag distinct from `vertical`.
// Kept in one module so the Board, filter menu, add-lead modal, and detail
// pane share one normalization + grouping definition. Case + spacing are
// preserved verbatim in the persisted value; this module only normalizes
// for dedup, grouping, filter equality, and the collapse persistence key.

// Sentinel key for leads that have no section set. Prefixed to make sure it
// can never collide with a real section (real values are `.trim()`ed to
// non-empty; sentinel starts with `__`).
export const UNASSIGNED_KEY = '__unassigned__';

// Canonical label shown in place of a bare section on the Unassigned lane.
// Kept out of the render layer so Board / Toolbar don't drift on the text.
export const UNASSIGNED_LABEL = 'Unassigned';

// Normalize any section-ish value to a stable key. Used for:
//   - dedup of sectionOptions (case-insensitive)
//   - lane grouping (leads sharing a key land in one lane)
//   - filter equality (`state.section` value compared against this key)
//   - drag-drop scope (source-lane vs target-lane check)
//   - lane-collapse localStorage key
export function sectionKeyOf(s: string | null | undefined): string {
  if (s == null) return UNASSIGNED_KEY;
  const t = s.trim().toLowerCase();
  return t === '' ? UNASSIGNED_KEY : t;
}

export type SectionGroup = {
  key: string; // sectionKeyOf() output
  label: string; // canonical form as first typed, or UNASSIGNED_LABEL
  leads: LeadCard[];
};

// Group leads into swimlane buckets. Named sections sorted alphabetically
// (case-insensitive) by label; the Unassigned bucket is always pinned last
// (cto.md §2.7). The canonical label is the first-seen exact form so
// "Dental" / "dental" / " dental " collapse to the first spelling — the
// lane header stays stable regardless of subsequent SDR casing.
export function groupLeadsBySection(leads: LeadCard[]): SectionGroup[] {
  const bucketsByKey = new Map<string, { label: string; leads: LeadCard[] }>();
  for (const lead of leads) {
    const raw = lead.section ?? null;
    const key = sectionKeyOf(raw);
    const existing = bucketsByKey.get(key);
    if (existing) {
      existing.leads.push(lead);
    } else {
      const label =
        key === UNASSIGNED_KEY
          ? UNASSIGNED_LABEL
          : (raw ?? '').trim() || UNASSIGNED_LABEL;
      bucketsByKey.set(key, { label, leads: [lead] });
    }
  }
  const named: SectionGroup[] = [];
  let unassigned: SectionGroup | null = null;
  for (const [key, bucket] of bucketsByKey) {
    const group: SectionGroup = { key, label: bucket.label, leads: bucket.leads };
    if (key === UNASSIGNED_KEY) unassigned = group;
    else named.push(group);
  }
  named.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  return unassigned ? [...named, unassigned] : named;
}

// Canonical sectionOptions: dedup by key, keep first-seen exact form as
// the canonical label, sorted alphabetically (case-insensitive). Feeds
// the toolbar filter dropdown + both autocomplete surfaces.
export function deriveSectionOptions(leads: LeadCard[]): string[] {
  const byKey = new Map<string, string>();
  for (const lead of leads) {
    const raw = lead.section;
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, trimmed);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
}

// Case-insensitive canonical-form match. Used by both blur handlers (modal
// + pane) to silently swap a typed value onto an existing canonical form
// if one exists. Returns the input unchanged when there's no hit.
export function canonicalizeSection(
  value: string,
  options: readonly string[],
): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toLowerCase();
  const hit = options.find((opt) => opt.toLowerCase() === key);
  return hit ?? trimmed;
}

// Lane-collapse persistence. Separate localStorage key from the filter
// state (see cto.md §2.6) so filter payloads stay small and per-lane
// collapse survives filter resets.
export const LANE_COLLAPSE_STORAGE_KEY = 'sk_board_lane_collapse_v1';

export function loadLaneCollapse(): Record<string, true> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LANE_COLLAPSE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, true> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (val === true) out[key] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLaneCollapse(state: Record<string, true>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANE_COLLAPSE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private-mode — non-fatal.
  }
}
