// Pure helpers for the lead-card reminder colour state.
//
// The founder-facing model is *calendar day* — the reminder is "today", "in the
// next 2 days", or "later / none". Store as `YYYY-MM-DD` on `sk_lead_state` and
// compare here as strings; fixed-width lexicographic order is identical to
// chronological order for that shape. No Date math in the colour decision → no
// timezone / DST bugs at day boundaries.
//
// Legacy `nextActionAt` (ISO datetime) can be coerced to `YYYY-MM-DD` via
// `isoToLocalDateString` — we take the SDR's local calendar day, matching the
// same rule fresh reminders use.

export type ReminderCardState = 'red' | 'yellow' | 'default';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns today in the SDR's local timezone as YYYY-MM-DD. `en-CA` is the
// canonical ICU locale that emits ISO-8601 date strings, so we don't have to
// pad month/day manually or worry about locale drift on the operator's laptop.
export function todayLocalDateString(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA');
}

// Add `days` calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD.
// Anchors on local midnight; safe across DST because we only inspect
// day/month/year on output.
export function addDaysLocal(dateStr: string, days: number): string {
  if (!DATE_RE.test(dateStr)) return dateStr;
  // `T00:00:00` (no Z) parses as local midnight on every modern JS engine.
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

// Coerce a legacy ISO datetime to the SDR's local calendar day. Used only by
// the projection fallback when `nextReminderAt` isn't set but the old
// `nextActionAt` still is.
export function isoToLocalDateString(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA');
}

// Normalize any incoming string to a valid YYYY-MM-DD, or null. Accepts both
// pure date strings and ISO datetimes (the latter is treated as legacy input).
export function normalizeReminderDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DATE_RE.test(value)) return value;
  return isoToLocalDateString(value);
}

// The three-state colour decision. Called from LeadCardView at render time.
// `now` is injectable purely for unit tests; callers pass nothing.
export function reminderCardState(
  nextReminderAt: string | null | undefined,
  now: Date = new Date(),
): ReminderCardState {
  const date = normalizeReminderDate(nextReminderAt ?? null);
  if (!date) return 'default';
  const today = todayLocalDateString(now);
  if (date <= today) return 'red';
  const twoDaysOut = addDaysLocal(today, 2);
  if (date <= twoDaysOut) return 'yellow';
  return 'default';
}

// Days between two YYYY-MM-DD strings (b - a). Negative when a > b. Callers
// use this to render "N days late" on the reminder chip. Uses UTC midnight
// for the subtraction so we don't wobble across DST transitions between the
// two dates.
export function daysBetween(a: string, b: string): number {
  if (!DATE_RE.test(a) || !DATE_RE.test(b)) return 0;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.round((bMs - aMs) / 86_400_000);
}

// Human label for the reminder chip on the card. Never returns "" — callers
// gate rendering on the value being non-null upstream.
export function reminderChipLabel(
  nextReminderAt: string,
  now: Date = new Date(),
): string {
  const date = normalizeReminderDate(nextReminderAt);
  if (!date) return '';
  const today = todayLocalDateString(now);
  if (date === today) return 'Rem: today';
  const tomorrow = addDaysLocal(today, 1);
  if (date === tomorrow) return 'Rem: tomorrow';
  if (date < today) {
    const late = daysBetween(date, today);
    const short = new Date(`${date}T00:00:00`).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    return `Rem: ${short} · ${late}d late`;
  }
  const short = new Date(`${date}T00:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  return `Rem: ${short}`;
}
