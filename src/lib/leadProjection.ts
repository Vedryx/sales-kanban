// Single source of truth for what fields leave the DB.
// NEVER return phone or raw email in card-shaped projections — only in detail.
import type {
  LeadCard,
  LeadDetail,
  MeetingSummary,
  PagespeedMetrics,
  PagespeedCategories,
  PagespeedField,
} from '@/types/lead';
import type { GranularStage } from '@/lib/stages';
import { normalizeReminderDate } from '@/lib/leads/reminderState';

// Max chars we ship on the collapsed card for the latest-summary preview.
// Design spec §3.2 clamps to 2 lines visually; the wire-size cap here is
// belt-and-suspenders so an SDR pasting a 5KB summary can't blow the board
// payload.
const CARD_SUMMARY_PREVIEW_MAX = 140;

export type RawLeadDoc = {
  placeId?: string;
  place_id?: string;
  name?: string;
  business?: string;
  city?: string;
  state?: unknown;
  vertical?: string;
  pagespeed?: number;
  pagespeedScore?: number;
  pagespeedFlag?: 'red' | 'amber' | 'green';
  pagespeedMetrics?: PagespeedMetrics;
  pagespeedCategories?: PagespeedCategories;
  pagespeedField?: PagespeedField;
  securityGrade?: string;
  website?: string;
  phone?: string;
  email?: string;
  ownerName?: string;
  timezone?: string;
  state_data?: {
    stage?: GranularStage;
    // Current field — YYYY-MM-DD calendar day, local timezone.
    nextReminderAt?: string | null;
    // Legacy fields — retained on the doc for backfill / audit only. UI no
    // longer writes to any of these. `nextActionAt` is coerced to a calendar
    // day and used as a fallback for `nextReminderAt` (see toCard). `lastNote`
    // is surfaced as a synthetic meeting-summary entry when the backfill
    // script hasn't run yet — see meetingSummariesFrom() below.
    nextActionAt?: string | null;
    nextActionIntent?: string | null;
    lastNote?: string | null;
    assignedTo?: string | null;
    email?: string | null; // SDR override (lives on sk_lead_state)
    // Human-set section tag (nullable). See sales-kanban-sections work.
    section?: string | null;
    pitchEmailSentAt?: string | null;
    pitchEmailLastError?: string | null;
    unreadReplyAt?: string | null;
    lastReadReplyAt?: string | null;
    // Persisted newest-first (via $push at the end + client sort on read).
    // On the wire the array is small (1-N per lead) so we sort in the
    // projection layer rather than an aggregation stage.
    meetingSummaries?: MeetingSummary[];
    updatedAt?: string | Date | null;
    // Deprecated money fields. Kept on the wire so we don't crash on legacy
    // docs but never surfaced in the LeadDetail projection.
    quote?: unknown;
    deal?: unknown;
    deposit?: unknown;
  };
};

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

// Effective email = SDR override if set, else valid_pulse_leads.email.
// Writing null clears the override (falls back to the raw source).
function effectiveEmail(raw: RawLeadDoc): string | undefined {
  const override = raw.state_data?.email;
  if (typeof override === 'string' && override.trim() !== '') return override;
  if (override === null) return undefined; // explicit clear
  return raw.email && raw.email.trim() !== '' ? raw.email : undefined;
}

// Reminder date, favouring the current field and falling back to a
// day-coerced version of the legacy `nextActionAt` so pre-migration rows
// still light up on the board.
function effectiveReminderDate(raw: RawLeadDoc): string | null {
  const s = raw.state_data ?? {};
  const fresh = normalizeReminderDate(s.nextReminderAt ?? null);
  if (fresh) return fresh;
  return normalizeReminderDate(s.nextActionAt ?? null);
}

// Newest-first meeting summaries, with a synthetic entry prepended if the
// legacy `lastNote` field is still populated and no backfill has landed.
// The synthetic entry's `id` uses a stable sentinel so idempotent client
// keys work and the backfill script can detect + skip it.
function meetingSummariesFrom(raw: RawLeadDoc): MeetingSummary[] | undefined {
  const s = raw.state_data ?? {};
  const arr: MeetingSummary[] = Array.isArray(s.meetingSummaries)
    ? [...s.meetingSummaries]
    : [];
  const legacyNote = typeof s.lastNote === 'string' ? s.lastNote.trim() : '';
  const alreadyImported = arr.some((m) => m.by === 'legacy-note');
  if (legacyNote && !alreadyImported) {
    const at =
      s.updatedAt instanceof Date
        ? s.updatedAt.toISOString()
        : typeof s.updatedAt === 'string'
          ? s.updatedAt
          : new Date(0).toISOString();
    arr.push({
      id: 'legacy-note',
      by: 'legacy-note',
      at,
      text: legacyNote,
    });
  }
  if (arr.length === 0) return undefined;
  return arr.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function latestSummaryPreview(
  summaries: MeetingSummary[] | undefined,
): LeadCard['latestMeetingSummary'] {
  if (!summaries || summaries.length === 0) return null;
  const top = summaries[0];
  const text =
    top.text.length > CARD_SUMMARY_PREVIEW_MAX
      ? `${top.text.slice(0, CARD_SUMMARY_PREVIEW_MAX - 1).trimEnd()}…`
      : top.text;
  return { text, at: top.at, by: top.by };
}

export function toCard(raw: RawLeadDoc): LeadCard {
  const placeId = raw.placeId ?? raw.place_id ?? '';
  const s = raw.state_data ?? {};
  const summaries = meetingSummariesFrom(raw);
  return {
    placeId,
    businessName: raw.name ?? raw.business ?? 'Unknown business',
    city: optionalText(raw.city),
    state: optionalText(raw.state),
    vertical: optionalText(raw.vertical),
    pagespeed: raw.pagespeed ?? raw.pagespeedScore,
    pagespeedFlag: raw.pagespeedFlag,
    website: raw.website,
    stage: s.stage ?? 'new',
    section: s.section ?? null,
    nextReminderAt: effectiveReminderDate(raw),
    latestMeetingSummary: latestSummaryPreview(summaries),
    assignedTo: s.assignedTo ?? null,
    hasEmail: !!effectiveEmail(raw),
    hasPitchEmailSent: !!s.pitchEmailSentAt,
    unreadReplyAt: s.unreadReplyAt ?? null,
    lastReadReplyAt: s.lastReadReplyAt ?? null,
  };
}

export function toDetail(raw: RawLeadDoc): LeadDetail {
  const card = toCard(raw);
  const s = raw.state_data ?? {};
  const summaries = meetingSummariesFrom(raw);
  return {
    ...card,
    phone: raw.phone,
    email: effectiveEmail(raw),
    ownerName: raw.ownerName,
    timezone: raw.timezone,
    pagespeedMetrics: raw.pagespeedMetrics,
    pagespeedCategories: raw.pagespeedCategories,
    pagespeedField: raw.pagespeedField,
    securityGrade: raw.securityGrade,
    pitchEmailSentAt: s.pitchEmailSentAt ?? null,
    pitchEmailLastError: s.pitchEmailLastError ?? null,
    meetingSummaries: summaries,
  };
}
