import { describe, expect, it } from 'vitest';
import {
  addDaysLocal,
  daysBetween,
  isoToLocalDateString,
  normalizeReminderDate,
  reminderCardState,
  reminderChipLabel,
  todayLocalDateString,
} from '../src/lib/leads/reminderState';

// Anchor "now" in the middle of a day to avoid boundary flakiness in CI.
function noonOn(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

describe('reminderCardState — three states', () => {
  const today = '2026-08-17';
  const now = noonOn(today);

  it('returns "default" when nextReminderAt is null / undefined / empty', () => {
    expect(reminderCardState(null, now)).toBe('default');
    expect(reminderCardState(undefined, now)).toBe('default');
    expect(reminderCardState('', now)).toBe('default');
  });

  it('returns "red" when the reminder date is in the past', () => {
    expect(reminderCardState('2026-08-16', now)).toBe('red');
    expect(reminderCardState('2026-06-01', now)).toBe('red');
  });

  it('returns "red" when the reminder date equals today', () => {
    expect(reminderCardState(today, now)).toBe('red');
  });

  it('returns "yellow" when the reminder date is tomorrow or +2 days', () => {
    expect(reminderCardState('2026-08-18', now)).toBe('yellow'); // +1
    expect(reminderCardState('2026-08-19', now)).toBe('yellow'); // +2
  });

  it('returns "default" when the reminder date is +3 days or beyond', () => {
    expect(reminderCardState('2026-08-20', now)).toBe('default'); // +3
    expect(reminderCardState('2027-01-01', now)).toBe('default');
  });

  it('returns "default" when the reminder date is a malformed string', () => {
    expect(reminderCardState('not-a-date', now)).toBe('default');
    expect(reminderCardState('20260817', now)).toBe('default');
  });

  it('accepts legacy ISO datetime input via normalizeReminderDate fallback', () => {
    // `2026-08-16T23:00:00-05:00` is Aug 17 in UTC but Aug 16 in US Central.
    // We anchor `now` to noon local, so the ISO string is interpreted with
    // the SDR's local timezone — the coerced day drives the state.
    const legacyIso = new Date(`${today}T00:00:00`).toISOString();
    const state = reminderCardState(legacyIso, now);
    // Whichever local day the ISO lands on, the state must be either 'red'
    // (today) or 'yellow'/'red' next-door depending on host TZ; assert it is
    // not 'default' so we know the fallback engaged.
    expect(['red', 'yellow']).toContain(state);
  });
});

describe('reminderChipLabel', () => {
  const today = '2026-08-17';
  const now = noonOn(today);

  it('renders "today" when the date equals today', () => {
    expect(reminderChipLabel(today, now)).toBe('Rem: today');
  });

  it('renders "tomorrow" when the date is +1 day', () => {
    expect(reminderChipLabel('2026-08-18', now)).toBe('Rem: tomorrow');
  });

  // Locale-agnostic: the short-format renderer emits "Aug 19" on en-US and
  // "19 Aug" on en-GB. Assert both tokens are present in the right order-
  // independent form.
  it('renders a short month/day for future dates > +1', () => {
    const aug19 = reminderChipLabel('2026-08-19', now);
    expect(aug19.startsWith('Rem: ')).toBe(true);
    expect(aug19).toContain('Aug');
    expect(aug19).toContain('19');
    expect(aug19).not.toContain('·'); // no "N late" suffix on a future date
  });

  it('renders "N days late" for past dates', () => {
    const label = reminderChipLabel('2026-08-15', now);
    expect(label.startsWith('Rem: ')).toBe(true);
    expect(label).toContain('Aug');
    expect(label).toContain('15');
    expect(label).toContain('2d late');
  });
});

describe('addDaysLocal + daysBetween + normalizeReminderDate helpers', () => {
  it('addDaysLocal moves the date forward and back safely', () => {
    expect(addDaysLocal('2026-08-17', 1)).toBe('2026-08-18');
    expect(addDaysLocal('2026-08-17', -2)).toBe('2026-08-15');
    expect(addDaysLocal('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('daysBetween returns the signed integer day delta', () => {
    expect(daysBetween('2026-08-17', '2026-08-19')).toBe(2);
    expect(daysBetween('2026-08-19', '2026-08-17')).toBe(-2);
    expect(daysBetween('2026-08-17', '2026-08-17')).toBe(0);
  });

  it('normalizeReminderDate accepts YYYY-MM-DD and legacy ISO', () => {
    expect(normalizeReminderDate('2026-08-17')).toBe('2026-08-17');
    expect(normalizeReminderDate(null)).toBe(null);
    expect(normalizeReminderDate('')).toBe(null);
    expect(normalizeReminderDate('not-a-date')).toBe(null);
    // Legacy ISO datetime — coerced to the SDR's local calendar day.
    const legacy = normalizeReminderDate(new Date('2026-08-17T12:00:00').toISOString());
    expect(legacy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('isoToLocalDateString returns null for garbage', () => {
    expect(isoToLocalDateString(null)).toBe(null);
    expect(isoToLocalDateString(undefined)).toBe(null);
    expect(isoToLocalDateString('not a date')).toBe(null);
  });

  it('todayLocalDateString emits ISO-8601 shape', () => {
    expect(todayLocalDateString(new Date('2026-08-17T12:00:00'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
