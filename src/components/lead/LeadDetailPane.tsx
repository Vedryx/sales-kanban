'use client';
import { useEffect, useState } from 'react';
import { X, Copy, AlertTriangle, Mail, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { LeadDetail, MeetingSummary } from '@/types/lead';
import type { Activity } from '@/types/activity';
import { LOST_OR_DNC } from '@/lib/stages';
import { reminderChipLabel, reminderCardState } from '@/lib/leads/reminderState';
import { PitchEmailModal } from './PitchEmailModal';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REMINDER_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function LeadDetailPane({
  placeId,
  onClose,
  onBook,
  onPatched,
  onDeleted,
}: {
  placeId: string;
  onClose: () => void;
  onBook: (leadEmail?: string) => void;
  onPatched: (patch: Partial<LeadDetail>) => void;
  onDeleted: (placeId: string) => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [futureMeetings, setFutureMeetings] = useState<number>(0);
  const [reminder, setReminder] = useState('');
  const [email, setEmail] = useState<string>('');
  const [pitchModalOpen, setPitchModalOpen] = useState(false);
  const [pitchEmailEnabled, setPitchEmailEnabled] = useState<boolean>(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(placeId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDeleteErr(body?.error ?? `Delete failed (${res.status}).`);
        setDeleting(false);
        return;
      }
      // Notify parent — it drops the card + closes the pane. We don't call
      // onClose() ourselves because onDeleted also handles pane teardown.
      onDeleted(placeId);
    } catch {
      setDeleteErr('Network error. Try again.');
      setDeleting(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/leads/${encodeURIComponent(placeId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setLead(d.lead);
        setActivities(d.activities ?? []);
        setFutureMeetings(d.futureMeetings ?? 0);
        setReminder(d.lead?.nextReminderAt ?? '');
        setEmail(d.lead?.email ?? '');
      });
    // Mark read on open. Idempotent — the endpoint just sets
    // lastReadReplyAt = now. We don't block detail-pane render on its
    // success; if it 401s (session expired), the badge stays and the
    // next poll will refetch.
    fetch(`/api/leads/${encodeURIComponent(placeId)}/mark-read`, {
      method: 'POST',
    }).then(() => {
      if (!active) return;
      onPatched({ lastReadReplyAt: new Date().toISOString() });
    }).catch(() => { /* swallow */ });
    fetch('/api/pitch-email-config')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        if (!active) return;
        setPitchEmailEnabled(!!d.enabled);
      })
      .catch(() => {
        if (active) setPitchEmailEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [placeId]);

  async function postPhoneViewed() {
    await fetch(`/api/leads/${encodeURIComponent(placeId)}/activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'phone_viewed' }),
    });
    fetch(`/api/leads/${encodeURIComponent(placeId)}`)
      .then((r) => r.json())
      .then((d) => {
        setLead(d.lead);
        setActivities(d.activities ?? []);
      });
  }

  async function patchState(patch: Partial<{
    nextReminderAt: string | null;
    email: string | null;
  }>) {
    await fetch(`/api/leads/${encodeURIComponent(placeId)}/state`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if ('email' in patch) {
      setLead((prev) =>
        prev ? { ...prev, email: patch.email ?? undefined } : prev,
      );
    }
    if ('nextReminderAt' in patch) {
      setLead((prev) =>
        prev ? { ...prev, nextReminderAt: patch.nextReminderAt ?? null } : prev,
      );
    }
    // The board's optimistic update consumes the card-shape Partial. `email`
    // never goes on the card, so strip it before passing up.
    const { email: _omit, ...cardPatch } = patch as Record<string, unknown>;
    void _omit;
    onPatched(cardPatch as Partial<LeadDetail>);
  }

  function commitReminder(next: string) {
    const trimmed = next.trim();
    if (trimmed === '') {
      patchState({ nextReminderAt: null });
      return;
    }
    if (!REMINDER_DATE_RE.test(trimmed)) return; // native date input already enforces
    patchState({ nextReminderAt: trimmed });
  }

  const showClosedBanner = !!lead && LOST_OR_DNC.includes(lead.stage) && futureMeetings > 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(12,9,8,0.55)', backdropFilter: 'blur(2px)' }}
      />
      <aside
        className="relative flex h-full w-[520px] max-w-[100vw] flex-col overflow-y-auto border-l max-sm:w-full"
        style={{ background: 'var(--color-bg2)', borderColor: 'var(--color-border2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-start justify-between border-b max-sm:px-4 max-sm:py-4 sm:px-6 sm:py-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div>
            <h2 className="m-0 text-[18px] font-extrabold tracking-tight">
              {lead?.businessName ?? 'Loading…'}
            </h2>
            <div className="mt-1 text-[12px]" style={{ color: 'var(--color-text3)' }}>
              {lead?.stage ?? '—'} · {lead?.city ?? ''} {lead?.state ?? ''}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {lead && (
              <button
                onClick={() => {
                  setDeleteErr(null);
                  setConfirmDeleteOpen(true);
                }}
                className="rounded-md p-1 hover:bg-[var(--color-surface)]"
                style={{ color: 'var(--color-red)' }}
                aria-label="Delete lead"
                title="Delete lead"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-[var(--color-surface)]"
              style={{ color: 'var(--color-text2)' }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {showClosedBanner && (
          <div
            className="mx-6 mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]"
            style={{
              background: 'var(--color-amber-soft)',
              borderColor: 'var(--color-amber)',
              color: 'var(--color-amber-d)',
            }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              This lead is closed but has {futureMeetings} upcoming meeting{futureMeetings === 1 ? '' : 's'}.
              Review &amp; cancel manually if needed.
            </div>
          </div>
        )}

        <div className="flex flex-col max-sm:gap-4 max-sm:p-4 sm:gap-5 sm:p-6">
          {/* Phone */}
          {lead?.phone && (
            <div className="flex items-center gap-3">
              <div className="mono flex-1 text-[26px] font-bold tracking-tight max-sm:text-[22px]">{lead.phone}</div>
              <button
                onClick={() => {
                  if (lead.phone) {
                    navigator.clipboard.writeText(lead.phone);
                  }
                  postPhoneViewed();
                }}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-[12px]"
                style={{
                  borderColor: 'var(--color-border2)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text2)',
                }}
              >
                <Copy size={12} /> Copy
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onBook(lead?.email)}
              className="rounded-md px-4 py-2 text-[13px] font-bold"
              style={{ background: 'var(--color-amber)', color: '#1b1715' }}
            >
              + Book G-Meet
            </button>
            <button
              onClick={() => setPitchModalOpen(true)}
              disabled={!pitchEmailEnabled || !email || !EMAIL_RE.test(email)}
              title={
                !pitchEmailEnabled
                  ? 'Pitch email disabled — set PITCH_EMAIL_ENABLED=true in Vercel env to turn on'
                  : !email || !EMAIL_RE.test(email)
                    ? 'Add a valid recipient email below'
                    : ''
              }
              className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-[13px] font-bold disabled:opacity-50"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-amber)',
                color: 'var(--color-amber)',
              }}
            >
              <Mail size={14} /> Send pitch email
            </button>
          </div>

          {/* Email */}
          <div>
            <Label>Email</Label>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => {
                  const trimmed = email.trim();
                  if (trimmed === '' || EMAIL_RE.test(trimmed)) {
                    patchState({ email: trimmed === '' ? null : trimmed });
                  }
                }}
                placeholder="add or correct"
                className="flex-1 rounded-md border px-3 py-2 text-[13px]"
                style={{
                  background: 'var(--color-surface)',
                  borderColor:
                    email === '' || EMAIL_RE.test(email)
                      ? 'var(--color-border2)'
                      : 'var(--color-red)',
                  color: 'var(--color-text)',
                }}
              />
              {lead?.pitchEmailSentAt && (
                <span
                  className="mono shrink-0 text-[10.5px]"
                  style={{ color: 'var(--color-text3)' }}
                  title={new Date(lead.pitchEmailSentAt).toLocaleString()}
                >
                  ✉ {formatRelative(lead.pitchEmailSentAt)}
                </span>
              )}
            </div>
            {lead?.pitchEmailLastError && (
              <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-red)' }}>
                last error: {lead.pitchEmailLastError}
              </div>
            )}
          </div>

          {/* Meeting summaries — primary block (design §4.2). Expanded by
              default; the composer sits at the top and the newest-first
              log below. */}
          {lead && (
            <MeetingSummariesBlock
              placeId={placeId}
              summaries={lead.meetingSummaries ?? []}
              onAdded={(s) => {
                setLead((prev) =>
                  prev
                    ? {
                        ...prev,
                        meetingSummaries: [s, ...(prev.meetingSummaries ?? [])],
                      }
                    : prev,
                );
                // Card preview mirrors the newest entry (truncated to the
                // wire-cap length used by the projection). Kept in sync so
                // the board updates without a full refetch.
                const preview =
                  s.text.length > 140
                    ? `${s.text.slice(0, 139).trimEnd()}…`
                    : s.text;
                onPatched({
                  latestMeetingSummary: { text: preview, at: s.at, by: s.by },
                });
              }}
            />
          )}

          {/* Next reminder — single date input, drives card colour state */}
          <div>
            <Label>Next reminder</Label>
            <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
              <input
                type="date"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
                onBlur={(e) => commitReminder(e.target.value)}
                className="flex-1 rounded-md border px-3 py-2 text-[13px]"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border2)',
                  color: 'var(--color-text)',
                }}
                aria-label="Next reminder date"
              />
              <ReminderPreviewChip value={reminder} />
            </div>
            <div className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text3)' }}>
              Sets card colour: red = due today or overdue, yellow = within 2 days.
            </div>
          </div>

          {/* PageSpeed */}
          {lead?.pagespeed != null && (
            <div>
              <Label>PageSpeed</Label>
              <div className="flex items-center gap-3">
                <span className="mono text-[18px] font-bold" style={{ color: 'var(--color-amber)' }}>
                  {lead.pagespeed}
                </span>
                {lead.pagespeedFlag && (
                  <span className="text-[11px]" style={{ color: 'var(--color-text3)' }}>
                    {lead.pagespeedFlag}
                  </span>
                )}
                {lead.website && (
                  <a
                    href={`https://pagespeed.web.dev/report?url=${encodeURIComponent(lead.website)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] underline"
                    style={{ color: 'var(--color-amber)' }}
                  >
                    Open full report ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Facts — basic client info stays; position shifted below the
              summaries + reminder per design §4.1. */}
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Fact label="Phone" value={lead?.phone ?? '—'} mono />
            <Fact label="Timezone" value={lead?.timezone ?? '—'} />
            <Fact label="Website" value={lead?.website ?? '—'} />
            <Fact label="Owner" value={lead?.ownerName ?? '—'} />
          </div>

          {/* Inbound replies — sanitized at the webhook write path
              (src/lib/email/sanitizeInbound.ts via /api/inbound/reply).
              We only ever render payload.htmlSanitized via
              dangerouslySetInnerHTML; raw payload.text / payload.html
              from Resend never make it to the DOM. */}
          {activities.some((a) => a.type === 'inbound_reply') && (
            <div>
              <Label>Inbound replies</Label>
              <div className="flex flex-col gap-2">
                {activities
                  .filter((a) => a.type === 'inbound_reply')
                  .map((a) => {
                    const p = (a.payload ?? {}) as {
                      from?: string;
                      subject?: string;
                      snippetText?: string;
                      htmlSanitized?: string;
                      receivedAt?: string;
                    };
                    return (
                      <div
                        key={a._id}
                        className="rounded-md border p-3 text-[12.5px]"
                        style={{
                          background: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className="truncate font-semibold"
                              style={{ color: 'var(--color-text)' }}
                            >
                              {p.subject || '(no subject)'}
                            </div>
                            <div
                              className="mono mt-0.5 truncate text-[10.5px]"
                              style={{ color: 'var(--color-text3)' }}
                            >
                              {p.from ?? 'unknown sender'}
                            </div>
                          </div>
                          <span
                            className="mono shrink-0 text-[10.5px]"
                            style={{ color: 'var(--color-text3)' }}
                            title={new Date(p.receivedAt ?? a.createdAt).toLocaleString()}
                          >
                            {formatRelative(p.receivedAt ?? a.createdAt)}
                          </span>
                        </div>
                        {p.htmlSanitized ? (
                          <div
                            className="mt-2 max-h-64 overflow-auto text-[12.5px]"
                            style={{ color: 'var(--color-text2)' }}
                            // Sanitized server-side via DOMPurify at
                            // /api/inbound/reply write path. Stored as
                            // payload.htmlSanitized. Never render raw.
                            dangerouslySetInnerHTML={{ __html: p.htmlSanitized }}
                          />
                        ) : p.snippetText ? (
                          <div
                            className="mt-2 whitespace-pre-wrap text-[12.5px]"
                            style={{ color: 'var(--color-text2)' }}
                          >
                            {p.snippetText}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Voice call transcripts — dispositions written by the outbound
              agent local bridge carry a full transcript in payload.transcript.
              Rendered as a dedicated block above the raw activity feed so the
              SDR doesn't have to squint at JSON to read a call. Transcript is
              a plain string (no HTML) so we render with whitespace-pre-wrap;
              no dangerouslySetInnerHTML. Duplicates keyed by callId are
              collapsed — bridge writes call_started + call_outcome per call
              and we only render the transcript-bearing outcome once. */}
          {activities.some((a) => a.type === 'disposition' && !!(a.payload as { transcript?: string })?.transcript) && (
            <div>
              <Label>Voice call transcripts</Label>
              <div className="flex flex-col gap-2">
                {(() => {
                  const seen = new Set<string>();
                  return activities
                    .filter((a) => {
                      if (a.type !== 'disposition') return false;
                      const p = (a.payload ?? {}) as { transcript?: string; callId?: string };
                      if (!p.transcript) return false;
                      const key = p.callId ?? a._id ?? String(a.createdAt);
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    })
                    .map((a) => {
                      const p = (a.payload ?? {}) as {
                        callId?: string;
                        disposition?: string;
                        productInterest?: string | null;
                        interestScore?: number | null;
                        summary?: string | null;
                        transcript?: string;
                      };
                      return (
                        <TranscriptCard
                          key={a._id ?? p.callId ?? String(a.createdAt)}
                          disposition={p.disposition ?? '—'}
                          summary={p.summary ?? null}
                          interestScore={p.interestScore ?? null}
                          productInterest={p.productInterest ?? null}
                          transcript={p.transcript ?? ''}
                          createdAt={a.createdAt}
                        />
                      );
                    });
                })()}
              </div>
            </div>
          )}

          {/* Activity */}
          <div>
            <Label>Activity</Label>
            <div className="flex flex-col gap-1.5">
              {activities.length === 0 && (
                <div className="text-[12px]" style={{ color: 'var(--color-text3)' }}>
                  No activity yet.
                </div>
              )}
              {activities.map((a) => (
                <div
                  key={a._id}
                  className="rounded-md border px-3 py-2 text-[12px]"
                  style={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  <div className="flex justify-between max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
                    <span className="font-semibold">{a.type}</span>
                    <span className="mono text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
                      {new Date(a.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  {a.payload && Object.keys(a.payload).length > 0 && (
                    <div className="mono mt-1 text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
                      {JSON.stringify(a.payload)}
                    </div>
                  )}
                  <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
                    {a.isSystem ? 'system' : (a.sdrName ?? a.sdrEmail)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {confirmDeleteOpen && lead && (
        <ConfirmDeleteDialog
          businessName={lead.businessName}
          busy={deleting}
          error={deleteErr}
          onCancel={() => {
            if (deleting) return;
            setConfirmDeleteOpen(false);
          }}
          onConfirm={handleDelete}
        />
      )}
      {pitchModalOpen && lead && lead.email && (
        <PitchEmailModal
          placeId={placeId}
          businessName={lead.businessName}
          website={lead.website}
          recipientEmail={lead.email}
          pagespeed={{
            score: lead.pagespeed ?? 0,
            flag: lead.pagespeedFlag ?? 'red',
            metrics: lead.pagespeedMetrics,
            categories: lead.pagespeedCategories,
            field: lead.pagespeedField,
          }}
          securityGrade={lead.securityGrade ?? null}
          alreadySentAt={lead.pitchEmailSentAt ?? null}
          onClose={() => setPitchModalOpen(false)}
          onSent={(sentAt) => {
            setLead((prev) =>
              prev ? { ...prev, pitchEmailSentAt: sentAt, pitchEmailLastError: null } : prev,
            );
            onPatched({ hasPitchEmailSent: true } as Partial<LeadDetail>);
          }}
        />
      )}
    </div>
  );
}

// The reminder input's inline preview chip. Mirrors the card chip 1:1 so the
// SDR sees the exact colour state they've just chosen before blur commits it.
function ReminderPreviewChip({ value }: { value: string }) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const state = reminderCardState(value);
  const label = reminderChipLabel(value);
  const palette =
    state === 'red'
      ? { color: 'var(--color-red)', background: 'rgba(227,132,118,0.22)' }
      : state === 'yellow'
        ? { color: 'var(--color-amber)', background: 'var(--color-amber-soft)' }
        : { color: 'var(--color-text3)', background: 'var(--color-surface)' };
  return (
    <span
      className="mono shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
      style={palette}
      aria-label={`Reminder preview: ${label.replace(/^Rem:\s*/, '')}`}
    >
      {label}
    </span>
  );
}

// Meeting-summary block. Design §4.2 upgrades this to the primary block:
// expanded by default (regardless of whether the lead has prior summaries)
// and the composer sits at the top so the SDR types straight in.
//
// Renders a synthetic `legacy-note` entry differently so the SDR sees at a
// glance that the row predates the meeting-summary model.
function MeetingSummariesBlock({
  placeId,
  summaries,
  onAdded,
}: {
  placeId: string;
  summaries: MeetingSummary[];
  onAdded: (s: MeetingSummary) => void;
}) {
  const hasSummaries = summaries.length > 0;
  const [open, setOpen] = useState<boolean>(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(placeId)}/summary`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErr(data?.error ?? 'Could not save summary.');
        setBusy(false);
        return;
      }
      onAdded(data.summary as MeetingSummary);
      setDraft('');
      setBusy(false);
    } catch {
      setErr('Network error. Try again.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between rounded-md text-[10.5px] font-bold tracking-wider uppercase"
        style={{ color: 'var(--color-text3)' }}
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Meeting summaries {hasSummaries && `(${summaries.length})`}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          <div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Log this meeting or call — what came up, next steps, who owes what."
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border p-2 text-[13px]"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border2)',
                color: 'var(--color-text)',
              }}
            />
            <div className="mt-1 flex items-center justify-between">
              <span
                className="mono text-[10.5px]"
                style={{ color: 'var(--color-text3)' }}
              >
                {draft.length}/2000 · Cmd/Ctrl+Enter to save
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={busy || draft.trim().length === 0}
                className="rounded-md px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
                style={{ background: 'var(--color-amber)', color: '#1b1715' }}
              >
                {busy ? 'Adding…' : 'Add summary'}
              </button>
            </div>
            {err && (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--color-red)' }}>
                {err}
              </p>
            )}
          </div>
          {hasSummaries && (
            <div className="flex flex-col gap-2">
              {summaries.map((s) => {
                const isLegacy = s.by === 'legacy-note';
                return (
                  <div
                    key={s.id}
                    className="rounded-md border p-3 text-[12.5px]"
                    style={{
                      background: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text2)',
                    }}
                  >
                    <div
                      className="mono mb-1.5 flex items-center justify-between gap-2 text-[10.5px]"
                      style={{ color: 'var(--color-text3)' }}
                    >
                      {isLegacy ? (
                        <span className="italic" title="Imported from the retired Notes field">
                          Legacy note (imported)
                        </span>
                      ) : (
                        <span title={s.by}>{s.by}</span>
                      )}
                      <span title={new Date(s.at).toLocaleString()}>
                        {new Date(s.at).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{s.text}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2 text-[10.5px] font-bold tracking-wider uppercase"
      style={{ color: 'var(--color-text3)' }}
    >
      {children}
    </div>
  );
}

function TranscriptCard({
  disposition,
  summary,
  interestScore,
  productInterest,
  transcript,
  createdAt,
}: {
  disposition: string;
  summary: string | null;
  interestScore: number | null;
  productInterest: string | null;
  transcript: string;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-md border p-3 text-[12.5px]"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide"
              style={{ background: 'var(--color-surface2, #1c1f24)', color: 'var(--color-text)' }}
            >
              {disposition}
            </span>
            {productInterest && (
              <span className="text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
                {productInterest}
              </span>
            )}
            {typeof interestScore === 'number' && (
              <span
                className="mono text-[10.5px] font-bold"
                style={{ color: 'var(--color-amber)' }}
                title="Interest score"
              >
                {interestScore}
              </span>
            )}
          </div>
        </div>
        <span
          className="mono shrink-0 text-[10.5px]"
          style={{ color: 'var(--color-text3)' }}
          title={new Date(createdAt).toLocaleString()}
        >
          {formatRelative(createdAt)}
        </span>
      </div>
      {summary && (
        <div className="mt-2 text-[12.5px]" style={{ color: 'var(--color-text2)' }}>
          {summary}
        </div>
      )}
      {transcript && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-2 text-[11px] underline"
            style={{ color: 'var(--color-text3)' }}
          >
            {open ? 'Hide transcript' : 'Show transcript'}
          </button>
          {open && (
            <div
              className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-[12px]"
              style={{
                background: 'var(--color-bg2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text2)',
              }}
            >
              {transcript}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text3)' }}>
        {label}
      </div>
      <div className={mono ? 'mono mt-1 text-[12.5px]' : 'mt-1 text-[12.5px]'}>{value}</div>
    </div>
  );
}
