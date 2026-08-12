'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { LeadCard } from '@/types/lead';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Lenient client check; the server validates with z.string().url(). We normalize
// a bare domain (no scheme) to https:// before sending so "acme.com" is accepted.
const URL_RE = /^(https?:\/\/)?[^\s.]+\.[^\s]+$/;

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function AddLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (lead: LeadCard) => void;
}) {
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [stateField, setStateField] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [firstSummary, setFirstSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const nameOk = businessName.trim().length > 0;
  // Website + email are optional. When present, validate the shape so we
  // don't send garbage to the server (server will still reject with 400 as
  // the final gate, but a client hint reads faster than a round-trip).
  const websiteOk = website.trim() === '' || URL_RE.test(website.trim());
  const emailOk = email.trim() === '' || EMAIL_RE.test(email.trim());
  const canSubmit = nameOk && websiteOk && emailOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const websiteTrimmed = website.trim();
      const emailTrimmed = email.trim();
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          website: websiteTrimmed ? normalizeUrl(websiteTrimmed) : undefined,
          email: emailTrimmed || undefined,
          city: city.trim() || undefined,
          state: stateField.trim() || undefined,
          phone: phone.trim() || undefined,
          ownerName: ownerName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErr('Could not add lead. Check the fields and try again.');
        setBusy(false);
        return;
      }
      // Optional first-meeting-summary: fire-and-forget chained POST to the
      // dedicated summary endpoint. We keep `createManualLead` lean by
      // pushing this into a second request rather than a wider signature.
      // Best-effort: if this second call fails, the lead still exists.
      const summaryText = firstSummary.trim();
      const placeId = data.lead?.placeId as string | undefined;
      if (summaryText && placeId) {
        try {
          await fetch(`/api/leads/${encodeURIComponent(placeId)}/summary`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: summaryText }),
          });
        } catch {
          // Non-fatal — the SDR can add the summary from the detail pane.
        }
      }
      onCreated(data.lead as LeadCard);
      onClose();
    } catch {
      setErr('Network error. Try again.');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center max-sm:items-end sm:items-center"
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(12,9,8,0.55)', backdropFilter: 'blur(2px)' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[520px] max-w-[94vw] overflow-hidden rounded-2xl border max-sm:w-full max-sm:max-w-full max-sm:max-h-[92vh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:flex max-sm:flex-col"
        style={{
          background: 'var(--color-bg2)',
          borderColor: 'var(--color-border2)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        <header
          className="flex items-start justify-between border-b max-sm:px-4 max-sm:py-3 sm:px-5 sm:py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div>
            <h3 className="m-0 text-[17px] font-extrabold tracking-tight">Add lead</h3>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--color-text3)' }}>
              Only business name is required. Add website + email to enable
              PageSpeed scoring and pitch email.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: 'var(--color-text2)' }}>
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto max-sm:flex-1 max-sm:px-4 max-sm:py-3 sm:max-h-[540px] sm:px-5 sm:py-4">
          <Field label="Business name" required>
            <TextInput value={businessName} onChange={setBusinessName} placeholder="Acme Inc" />
          </Field>

          <Field label="Website" invalid={website.length > 0 && !websiteOk}>
            <TextInput value={website} onChange={setWebsite} placeholder="acme.com" />
          </Field>

          <Field label="Email" invalid={email.length > 0 && !emailOk}>
            <TextInput value={email} onChange={setEmail} placeholder="owner@acme.com" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <TextInput value={city} onChange={setCity} placeholder="Austin" />
            </Field>
            <Field label="State">
              <TextInput value={stateField} onChange={setStateField} placeholder="TX" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <TextInput value={phone} onChange={setPhone} placeholder="+1 555 123 4567" />
            </Field>
            <Field label="Owner name">
              <TextInput value={ownerName} onChange={setOwnerName} placeholder="Jane Doe" />
            </Field>
          </div>

          <Field label="First meeting summary (optional)">
            <textarea
              value={firstSummary}
              onChange={(e) => setFirstSummary(e.target.value)}
              placeholder="Where did you hear about this lead? What did they say?"
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
            />
          </Field>

          {err && (
            <p className="text-[12.5px]" style={{ color: 'var(--color-red)' }}>
              {err}
            </p>
          )}
        </div>

        <footer
          className="flex justify-end gap-2 border-t max-sm:px-4 max-sm:py-3 sm:px-5 sm:py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={onClose}
            className="rounded-md border px-3 py-2 text-[12.5px] font-bold"
            style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-md px-4 py-2 text-[12.5px] font-bold disabled:opacity-50"
            style={{ background: 'var(--color-amber)', color: '#1b1715' }}
          >
            {busy ? 'Adding…' : 'Add lead'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none"
      style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
    />
  );
}

function Field({
  label,
  required,
  invalid,
  children,
}: {
  label: string;
  required?: boolean;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="mb-1.5 text-[10.5px] font-bold tracking-wider uppercase"
        style={{ color: invalid ? 'var(--color-red)' : 'var(--color-text3)' }}
      >
        {label}
        {required && <span style={{ color: 'var(--color-red)' }}> *</span>}
      </div>
      {children}
    </div>
  );
}
