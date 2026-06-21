'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Mail, Plus, Upload as UploadIcon, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { upload } from '@vercel/blob/client';
import { renderPitchEmail } from '@/lib/email/template';
import type { PagespeedMetrics, PagespeedCategories, PagespeedField } from '@/types/lead';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Screenshot = { url: string; alt?: string; status: 'ready' | 'uploading' };

type Props = {
  placeId: string;
  businessName: string;
  website?: string;
  recipientEmail: string;
  pagespeed: {
    score: number;
    flag: 'red' | 'amber' | 'green';
    metrics?: PagespeedMetrics;
    categories?: PagespeedCategories;
    field?: PagespeedField;
  };
  securityGrade?: string | null;
  alreadySentAt?: string | null;
  onClose: () => void;
  onSent: (sentAt: string) => void;
};

export function PitchEmailModal({
  placeId,
  businessName,
  website,
  recipientEmail,
  pagespeed,
  securityGrade,
  alreadySentAt,
  onClose,
  onSent,
}: Props) {
  const [recipient, setRecipient] = useState(recipientEmail);
  const [subject, setSubject] = useState(
    `Quick audit of ${businessName} — and a working rebuild`,
  );
  const [demoUrl, setDemoUrl] = useState('');
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [psScore, setPsScore] = useState<number>(pagespeed.score);
  const [psFlag, setPsFlag] = useState<'red' | 'amber' | 'green'>(pagespeed.flag);
  const [showPreview, setShowPreview] = useState<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches,
  );
  const [state, setState] = useState<'form' | 'sending' | 'ok' | 'err'>('form');
  const [okMeta, setOkMeta] = useState<{ resendId?: string; sentAt?: string } | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [errCode, setErrCode] = useState('');
  const [dismissedRecentBanner, setDismissedRecentBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recipientValid = EMAIL_RE.test(recipient);

  // ESC to close.
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const sentRecently = useMemo(() => {
    if (!alreadySentAt) return false;
    const ms = Date.now() - new Date(alreadySentAt).getTime();
    return ms < 24 * 60 * 60 * 1000;
  }, [alreadySentAt]);

  const previewHtml = useMemo(() => {
    if (!showPreview) return '';
    return renderPitchEmail({
      businessName,
      website,
      pagespeed: {
        score: psScore,
        flag: psFlag,
        metrics: pagespeed.metrics,
        categories: pagespeed.categories,
        field: pagespeed.field,
      },
      securityGrade: securityGrade ?? null,
      demoUrl: demoUrl || null,
      screenshots: screenshots.filter((s) => s.status === 'ready'),
      customNote: customNote || null,
      sdrName: undefined,
      subject,
    }).html;
  }, [
    showPreview,
    businessName,
    website,
    psScore,
    psFlag,
    pagespeed.metrics,
    pagespeed.categories,
    pagespeed.field,
    securityGrade,
    demoUrl,
    screenshots,
    customNote,
    subject,
  ]);

  function addUrl(url: string) {
    if (screenshots.length >= 3) return;
    if (!/^https?:\/\//i.test(url.trim())) return;
    setScreenshots((arr) => [...arr, { url: url.trim(), status: 'ready' }]);
  }

  async function handleFile(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrMsg('Only PNG, JPG, or WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrMsg('Max 5MB per screenshot.');
      return;
    }
    const placeholder: Screenshot = { url: '', status: 'uploading' };
    setScreenshots((arr) => [...arr, placeholder]);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const pathname = `pitch-email/${placeId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/uploads/screenshot',
        contentType: file.type,
      });
      setScreenshots((arr) => {
        const next = [...arr];
        const idx = next.indexOf(placeholder);
        if (idx >= 0) next[idx] = { url: blob.url, status: 'ready' };
        return next;
      });
    } catch (err) {
      setErrMsg(`Upload failed: ${(err as Error).message}`);
      setScreenshots((arr) => arr.filter((s) => s !== placeholder));
    }
  }

  function removeShot(i: number) {
    setScreenshots((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setState('sending');
    setErrMsg('');
    setErrCode('');
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(placeId)}/pitch-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject,
          demoUrl: demoUrl || null,
          screenshots: screenshots
            .filter((s) => s.status === 'ready')
            .map(({ url, alt }) => ({ url, alt })),
          customNote: customNote || null,
          pagespeed: {
            score: psScore,
            flag: psFlag,
            metrics: pagespeed.metrics,
            categories: pagespeed.categories,
            field: pagespeed.field,
          },
          securityGrade: securityGrade ?? null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrCode(body.error ?? 'unknown');
        setErrMsg(body.message ?? 'Send failed.');
        setState('err');
        return;
      }
      setOkMeta({ resendId: body.resendId, sentAt: body.sentAt });
      onSent(body.sentAt);
      setState('ok');
    } catch (err) {
      setErrCode('network');
      setErrMsg((err as Error).message);
      setState('err');
    }
  }

  const canSend =
    state === 'form' &&
    recipientValid &&
    subject.trim().length > 0 &&
    screenshots.every((s) => s.status === 'ready');

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
        className="relative w-[560px] max-w-[94vw] overflow-hidden rounded-2xl border max-sm:w-full max-sm:max-w-full max-sm:max-h-[92vh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:flex max-sm:flex-col"
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
            <h3 className="m-0 flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
              <Mail size={16} /> Send pitch email
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--color-text3)' }}>
              {businessName} · {recipient || '—'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: 'var(--color-text2)' }}>
            <X size={18} />
          </button>
        </header>

        {state === 'form' && (
          <div className="flex flex-col gap-4 overflow-y-auto max-sm:flex-1 max-sm:px-4 max-sm:py-3 sm:max-h-[560px] sm:px-5 sm:py-4">
            {sentRecently && !dismissedRecentBanner && alreadySentAt && (
              <div
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--color-amber-soft)',
                  borderColor: 'var(--color-amber)',
                  color: 'var(--color-amber-d)',
                }}
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  Already emailed this lead{' '}
                  {Math.round((Date.now() - new Date(alreadySentAt).getTime()) / 3_600_000)}h ago.
                  Send again?
                </div>
                <button onClick={() => setDismissedRecentBanner(true)} aria-label="Dismiss">
                  <X size={12} />
                </button>
              </div>
            )}

            <Field label="Recipient">
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px]"
                style={{
                  borderColor:
                    recipientValid || recipient === '' ? 'var(--color-border2)' : 'var(--color-red)',
                  color: 'var(--color-text)',
                }}
              />
            </Field>

            <Field label="Subject">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px]"
                style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
              />
            </Field>

            <Field label="Demo URL (optional)">
              <input
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="https://pulse-demo.vedryxtech.com/…"
                className="mono w-full rounded-md border bg-transparent px-3 py-2 text-[12.5px]"
                style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
              />
            </Field>

            <Field label={`Screenshots (${screenshots.length}/3)`}>
              <div className="flex flex-col gap-2">
                {screenshots.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11.5px]"
                    style={{
                      background: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                    }}
                  >
                    {s.status === 'uploading' ? (
                      <span style={{ color: 'var(--color-text3)' }}>uploading…</span>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.url}
                          alt=""
                          width={40}
                          height={28}
                          style={{ objectFit: 'cover', borderRadius: 4 }}
                        />
                        <span
                          className="mono flex-1 truncate"
                          style={{ color: 'var(--color-text2)' }}
                        >
                          {s.url}
                        </span>
                      </>
                    )}
                    <button onClick={() => removeShot(i)} aria-label="Remove">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {screenshots.length < 3 && (
                  <div className="flex gap-2">
                    <input
                      placeholder="paste image URL"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const v = (e.target as HTMLInputElement).value;
                          addUrl(v);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      className="mono flex-1 rounded-md border bg-transparent px-2 py-1.5 text-[11.5px]"
                      style={{
                        borderColor: 'var(--color-border2)',
                        color: 'var(--color-text)',
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11.5px]"
                      style={{
                        borderColor: 'var(--color-border2)',
                        color: 'var(--color-text2)',
                      }}
                    >
                      <UploadIcon size={11} /> Upload
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
              </div>
            </Field>

            <Field label={`Custom note (${customNote.length}/500)`}>
              <textarea
                rows={3}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value.slice(0, 500))}
                placeholder="e.g. 'Saw your tweet about cart abandonment — this rebuild fixes that flow.'"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px]"
                style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="PageSpeed score">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={psScore}
                  onChange={(e) =>
                    setPsScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="mono w-full rounded-md border bg-transparent px-3 py-2 text-[13px]"
                  style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text)' }}
                />
              </Field>
              <Field label="Flag">
                <div className="flex gap-1.5">
                  {(['red', 'amber', 'green'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setPsFlag(f)}
                      className="rounded-md px-3 py-1.5 text-[11.5px] font-semibold"
                      style={{
                        background: psFlag === f ? `var(--color-${f})` : 'var(--color-surface2)',
                        color: psFlag === f ? '#1b1715' : 'var(--color-text2)',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <div>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1 text-[11.5px]"
                style={{ color: 'var(--color-amber)' }}
              >
                {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                {showPreview ? 'Hide preview' : 'Show preview'}
              </button>
              {showPreview && (
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  className="mt-2 w-full rounded-md border"
                  style={{ borderColor: 'var(--color-border)', height: 320, background: '#fff' }}
                />
              )}
            </div>
          </div>
        )}

        {state === 'sending' && (
          <div className="px-6 py-10 text-center text-[13px]" style={{ color: 'var(--color-text2)' }}>
            Sending…
          </div>
        )}

        {state === 'ok' && (
          <div className="px-6 py-8 text-center">
            <div
              className="mx-auto mb-4 h-8 w-8 rounded-full"
              style={{ background: 'var(--color-green)', boxShadow: '0 0 22px rgba(131,194,141,0.55)' }}
            />
            <div className="text-[15px] font-bold">Pitch sent</div>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--color-text2)' }}>
              {recipient} · {okMeta?.sentAt ? new Date(okMeta.sentAt).toLocaleString() : ''}
            </div>
            {okMeta?.resendId && (
              <div className="mono mt-2 text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
                resend id: {okMeta.resendId}
              </div>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={onClose}
                className="rounded-md px-3 py-2 text-[12.5px] font-bold"
                style={{ background: 'var(--color-amber)', color: '#1b1715' }}
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
            <div className="text-[15px] font-bold">Couldn&apos;t send.</div>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--color-text2)' }}>
              {errMsg}
            </div>
            <div className="mono mt-2 text-[10.5px]" style={{ color: 'var(--color-text3)' }}>
              {errCode}
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
            className="flex items-center justify-end gap-2 border-t max-sm:px-4 max-sm:py-3 sm:px-5 sm:py-3"
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
              disabled={!canSend}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-bold disabled:opacity-50"
              style={{ background: 'var(--color-amber)', color: '#1b1715' }}
            >
              <Plus size={12} /> Send pitch
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
