'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { X, Video, Phone, MapPin, Plus } from 'lucide-react';
import { nextHalfHour } from '@/lib/utils';

type Type = 'gmeet' | 'phone' | 'inperson';
type Duration = 15 | 30 | 45 | 60;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function BookMeetingModal({
  placeId,
  businessName,
  leadEmail,
  onClose,
}: {
  placeId: string;
  businessName: string;
  leadEmail?: string;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const myEmail = session?.user?.email ?? '';
  const [titleSuffix, setTitleSuffix] = useState(''); // user types after "Vedryx-"
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState<string>(() => {
    const t = nextHalfHour();
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  });
  const [duration, setDuration] = useState<Duration>(30);
  const [type, setType] = useState<Type>('gmeet');
  const [address, setAddress] = useState('');
  const [agenda, setAgenda] = useState('');
  const [extraEmails, setExtraEmails] = useState<string[]>(() =>
    leadEmail ? [leadEmail] : [],
  );
  const [newEmail, setNewEmail] = useState('');
  const [emailErr, setEmailErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'form' | 'ok' | 'err'>('form');
  const [okMeta, setOkMeta] = useState<{ meetLink?: string | null; htmlLink?: string | null } | null>(
    null,
  );
  const [errMsg, setErrMsg] = useState<string>('');

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  function addEmail() {
    if (!EMAIL_RE.test(newEmail)) {
      setEmailErr(true);
      setTimeout(() => setEmailErr(false), 300);
      return;
    }
    setExtraEmails((arr) => [...new Set([...arr, newEmail])]);
    setNewEmail('');
  }

  async function submit() {
    setBusy(true);
    setState('form');
    const title = `Vedryx-${titleSuffix.trim()}`;
    const startISO = new Date(`${date}T${time}:00`).toISOString();
    const attendeeEmails = [myEmail, ...extraEmails].filter(Boolean);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          leadPlaceId: placeId,
          leadBusinessName: businessName,
          leadEmail: leadEmail ?? null,
          title,
          startISO,
          durationMin: duration,
          timezone: tz,
          attendeeEmails,
          meetingType: type,
          inPersonAddress: type === 'inperson' ? address : null,
          agenda: agenda || null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrMsg(body.message || 'Booking failed.');
        setState('err');
      } else {
        setOkMeta({ meetLink: body.meetLink, htmlLink: body.htmlLink });
        setState('ok');
      }
    } catch (e) {
      setErrMsg(String(e));
      setState('err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(12,9,8,0.55)', backdropFilter: 'blur(2px)' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[520px] max-w-[94vw] overflow-hidden rounded-2xl border"
        style={{
          background: 'var(--color-bg2)',
          borderColor: 'var(--color-border2)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        <header
          className="flex items-start justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div>
            <h3 className="m-0 text-[17px] font-extrabold tracking-tight">
              Book meeting with {businessName}
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--color-text3)' }}>
              Fill the basics, confirm, done.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: 'var(--color-text2)' }}>
            <X size={18} />
          </button>
        </header>

        {state === 'form' && (
          <div className="flex max-h-[540px] flex-col gap-4 overflow-y-auto px-5 py-4">
            <Field label="Title">
              <div
                className="flex items-center rounded-md border"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border2)' }}
              >
                <span
                  className="mono py-2.5 pl-3 text-[13px]"
                  style={{ color: 'var(--color-text3)' }}
                >
                  Vedryx-
                </span>
                <input
                  value={titleSuffix}
                  onChange={(e) => setTitleSuffix(e.target.value)}
                  placeholder="audit-walkthrough"
                  className="mono flex-1 bg-transparent py-2.5 pr-3 text-[13px] outline-none"
                  style={{ color: 'var(--color-text)' }}
                />
              </div>
            </Field>

            <Field label="When">
              <div className="flex gap-2">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="flex-1" />
              </div>
            </Field>

            <Field label="Duration">
              <div className="flex gap-2">
                {[15, 30, 45, 60].map((d) => (
                  <Chip key={d} selected={duration === d} onClick={() => setDuration(d as Duration)}>
                    {d}m
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Type">
              <div className="flex gap-2">
                <Chip selected={type === 'gmeet'} onClick={() => setType('gmeet')}>
                  <Video size={12} /> G-Meet
                </Chip>
                <Chip selected={type === 'phone'} onClick={() => setType('phone')}>
                  <Phone size={12} /> Phone
                </Chip>
                <Chip selected={type === 'inperson'} onClick={() => setType('inperson')}>
                  <MapPin size={12} /> In-person
                </Chip>
              </div>
              {type === 'inperson' && (
                <input
                  placeholder="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-[13px]"
                  style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
                />
              )}
            </Field>

            <Field label="Attendees">
              <div className="flex flex-wrap gap-1.5">
                <Locked>{myEmail || 'you'}</Locked>
                {extraEmails.map((e) => (
                  <button
                    key={e}
                    onClick={() => setExtraEmails((arr) => arr.filter((x) => x !== e))}
                    className="mono flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                    style={{
                      background: 'var(--color-surface2)',
                      borderColor: 'var(--color-border)',
                    }}
                  >
                    {e} <X size={10} />
                  </button>
                ))}
                <input
                  placeholder="+ add invitee"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  className="mono rounded-md border px-2 py-1 text-[11px]"
                  style={{
                    background: 'transparent',
                    borderColor: emailErr ? 'var(--color-red)' : 'var(--color-border2)',
                    color: 'var(--color-amber)',
                  }}
                />
                <button
                  onClick={addEmail}
                  className="rounded-md border px-2 py-1 text-[11px]"
                  style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
                >
                  <Plus size={10} />
                </button>
              </div>
            </Field>

            <Field label="Agenda">
              <textarea
                rows={3}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="What's the meeting about?"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px]"
                style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
              />
            </Field>
          </div>
        )}

        {state === 'ok' && (
          <div className="px-6 py-8 text-center">
            <div
              className="mx-auto mb-4 h-8 w-8 rounded-full"
              style={{ background: 'var(--color-green)', boxShadow: '0 0 22px rgba(131,194,141,0.55)' }}
            />
            <div className="text-[15px] font-bold">Meeting booked</div>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--color-text2)' }}>
              Calendar invite {process.env.NEXT_PUBLIC_PREVIEW === 'true' ? 'NOT sent (preview)' : 'sent'} to attendees.
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {okMeta?.meetLink && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={okMeta.meetLink}
                  className="rounded-md px-3 py-2 text-[12.5px] font-bold"
                  style={{ background: 'var(--color-amber)', color: '#1b1715' }}
                >
                  Open G-Meet ↗
                </a>
              )}
              {okMeta?.htmlLink && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={okMeta.htmlLink}
                  className="rounded-md border px-3 py-2 text-[12.5px]"
                  style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
                >
                  Open in Calendar ↗
                </a>
              )}
              <button
                onClick={onClose}
                className="rounded-md border px-3 py-2 text-[12.5px]"
                style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {state === 'err' && (
          <div className="px-6 py-8 text-center">
            <div
              className="mx-auto mb-4 h-8 w-8 rounded-full"
              style={{ background: 'var(--color-red)', boxShadow: '0 0 22px rgba(227,132,118,0.55)' }}
            />
            <div className="text-[15px] font-bold">Couldn&apos;t reach Google Calendar.</div>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--color-text2)' }}>
              Meeting not saved. Retry, or close and try again later.
            </div>
            <div className="mono mt-2 text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
              {errMsg}
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setState('form')}
                className="rounded-md px-3 py-2 text-[12.5px] font-bold"
                style={{ background: 'var(--color-amber)', color: '#1b1715' }}
              >
                Retry
              </button>
              <button
                onClick={onClose}
                className="rounded-md border px-3 py-2 text-[12.5px]"
                style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {state === 'form' && (
          <footer
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <button
              onClick={onClose}
              className="rounded-md border px-3 py-2 text-[12.5px]"
              style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || titleSuffix.trim().length === 0}
              className="rounded-md px-3 py-2 text-[12.5px] font-bold disabled:opacity-50"
              style={{ background: 'var(--color-amber)', color: '#1b1715' }}
            >
              {busy ? 'Booking…' : 'Book meeting'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-1.5 text-[10.5px] font-bold tracking-wider uppercase"
        style={{ color: 'var(--color-text3)' }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold"
      style={{
        background: selected ? 'var(--color-amber)' : 'var(--color-surface2)',
        color: selected ? '#1b1715' : 'var(--color-text)',
      }}
    >
      {children}
    </button>
  );
}

function Locked({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
      style={{
        background: 'var(--color-surface2)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text2)',
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--color-text3)' }}
      />
      {children}
    </span>
  );
}
