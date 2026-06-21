'use client';
import { useEffect, useState } from 'react';
import { X, Copy, AlertTriangle, Mail } from 'lucide-react';
import type { LeadDetail } from '@/types/lead';
import type { Activity } from '@/types/activity';
import { LOST_OR_DNC, type GranularStage } from '@/lib/stages';
import { PitchEmailModal } from './PitchEmailModal';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const DISPOSITIONS: { code: string; label: string; intent?: string; advanceTo?: GranularStage }[] = [
  { code: 'no_answer', label: 'No answer · +2h', intent: 'retry call' },
  { code: 'busy', label: 'Busy · +30m', intent: 'retry call' },
  { code: 'voicemail', label: 'Voicemail · +24h', intent: 'follow-up call' },
  { code: 'wrong_number', label: 'Wrong # · DNC', advanceTo: 'closed_dnc' },
  { code: 'connected', label: 'Connected', advanceTo: 'connected' },
  { code: 'demo_booked', label: 'Demo booked', advanceTo: 'demo_booked' },
];

export function LeadDetailPane({
  placeId,
  onClose,
  onBook,
  onPatched,
}: {
  placeId: string;
  onClose: () => void;
  onBook: (leadEmail?: string) => void;
  onPatched: (patch: Partial<LeadDetail>) => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [futureMeetings, setFutureMeetings] = useState<number>(0);
  const [note, setNote] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [nextIntent, setNextIntent] = useState('');
  const [email, setEmail] = useState<string>('');
  const [pitchModalOpen, setPitchModalOpen] = useState(false);
  const [pitchEmailEnabled, setPitchEmailEnabled] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/leads/${encodeURIComponent(placeId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setLead(d.lead);
        setActivities(d.activities ?? []);
        setFutureMeetings(d.futureMeetings ?? 0);
        setNote(d.lead?.lastNote ?? '');
        setNextAt(d.lead?.nextActionAt ?? '');
        setNextIntent(d.lead?.nextActionIntent ?? '');
        setEmail(d.lead?.email ?? '');
      });
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

  async function postActivity(code: string, intent?: string, advanceTo?: GranularStage) {
    await fetch(`/api/leads/${encodeURIComponent(placeId)}/activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, intent, advanceTo }),
    });
    fetch(`/api/leads/${encodeURIComponent(placeId)}`)
      .then((r) => r.json())
      .then((d) => {
        setLead(d.lead);
        setActivities(d.activities ?? []);
        if (advanceTo) onPatched({ stage: advanceTo });
      });
  }

  async function patchState(patch: Partial<{
    lastNote: string;
    nextActionAt: string;
    nextActionIntent: string;
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
    // The board's optimistic update consumes the card-shape Partial. `email`
    // never goes on the card, so strip it before passing up.
    const { email: _omit, ...cardPatch } = patch as Record<string, unknown>;
    void _omit;
    onPatched(cardPatch as Partial<LeadDetail>);
  }

  async function patchMoney(field: 'quote' | 'deal' | 'deposit', amount: number | null) {
    const res = await fetch(`/api/leads/${encodeURIComponent(placeId)}/money`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ field, amount }),
    });
    if (!res.ok) return;
    // Optimistic local update.
    setLead((prev) => {
      if (!prev) return prev;
      const nowIso = new Date().toISOString();
      if (field === 'quote') {
        return { ...prev, quote: { amount, currency: 'USD', sentAt: amount != null ? nowIso : null } };
      }
      if (field === 'deal') {
        return { ...prev, deal: { amount, currency: 'USD', closedAt: amount != null ? nowIso : null } };
      }
      return { ...prev, deposit: { amount, paidAt: amount != null ? nowIso : null } };
    });
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
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-[var(--color-surface)]"
            style={{ color: 'var(--color-text2)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
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
                  postActivity('phone_viewed');
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

          {/* Dispositions */}
          <div>
            <Label>Disposition</Label>
            <div className="grid grid-cols-2 gap-2">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.code}
                  onClick={() => postActivity(d.code, d.intent, d.advanceTo)}
                  className="rounded-md border px-3 py-2 text-left text-[12px] hover:bg-[var(--color-surface2)]"
                  style={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border2)',
                    color: 'var(--color-text)',
                  }}
                >
                  {d.label}
                </button>
              ))}
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

          {/* Facts */}
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Fact label="Phone" value={lead?.phone ?? '—'} mono />
            <Fact label="Timezone" value={lead?.timezone ?? '—'} />
            <Fact label="Website" value={lead?.website ?? '—'} />
            <Fact label="Owner" value={lead?.ownerName ?? '—'} />
          </div>

          {/* Money fields — editable; save on blur */}
          <div className="grid gap-3 max-sm:grid-cols-1 sm:grid-cols-3">
            <MoneyField
              label="Quote"
              amount={lead?.quote?.amount ?? null}
              onSave={(amt) => patchMoney('quote', amt)}
            />
            <MoneyField
              label="Deal"
              amount={lead?.deal?.amount ?? null}
              onSave={(amt) => patchMoney('deal', amt)}
            />
            <MoneyField
              label="Deposit"
              amount={lead?.deposit?.amount ?? null}
              onSave={(amt) => patchMoney('deposit', amt)}
            />
          </div>

          {/* Next action */}
          <div>
            <Label>Next action</Label>
            <div className="flex gap-2 max-sm:flex-col">
              <input
                type="datetime-local"
                value={nextAt ? new Date(nextAt).toISOString().slice(0, 16) : ''}
                onChange={(e) => setNextAt(new Date(e.target.value).toISOString())}
                onBlur={() => patchState({ nextActionAt: nextAt })}
                className="flex-1"
              />
              <input
                placeholder="intent"
                value={nextIntent}
                onChange={(e) => setNextIntent(e.target.value)}
                onBlur={() => patchState({ nextActionIntent: nextIntent })}
                className="flex-1 rounded-md border px-3 py-2 text-[12.5px]"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border2)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => patchState({ lastNote: note })}
              rows={3}
              className="w-full rounded-md border p-2 text-[13px]"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border2)',
                color: 'var(--color-text)',
              }}
            />
          </div>

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

function MoneyField({
  label,
  amount,
  onSave,
}: {
  label: string;
  amount: number | null;
  onSave: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState<string>(amount != null ? String(amount) : '');

  // Re-sync when the upstream amount changes (e.g. after a fetch).
  useEffect(() => {
    setDraft(amount != null ? String(amount) : '');
  }, [amount]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (amount !== null) onSave(null);
      return;
    }
    const parsed = Number(trimmed.replace(/,/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      // Reject — restore.
      setDraft(amount != null ? String(amount) : '');
      return;
    }
    if (parsed !== amount) onSave(parsed);
  }

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
      <div className="mono mt-1 flex items-baseline gap-1 text-[14px]" style={{ color: 'var(--color-amber)' }}>
        <span>$</span>
        <input
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className="mono w-full bg-transparent text-[14px] outline-none"
          style={{ color: 'var(--color-amber)' }}
          aria-label={`${label} amount in USD`}
        />
      </div>
    </div>
  );
}
