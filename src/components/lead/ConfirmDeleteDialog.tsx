'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

// Destructive-action confirm. Hand-rolled to match the existing modal
// idiom (AddLeadModal / BookMeetingModal / PitchEmailModal) rather than
// pulling in Radix Dialog — every other modal here is hand-rolled and
// mixing patterns would break the visual language. Escape + backdrop-click
// dismiss unless `busy` is true (mid-delete = locked to prevent accidental
// re-open racing the in-flight DELETE).
export function ConfirmDeleteDialog({
  businessName,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  businessName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(12,9,8,0.6)', backdropFilter: 'blur(2px)' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[440px] max-w-full overflow-hidden rounded-2xl border"
        style={{
          background: 'var(--color-bg2)',
          borderColor: 'var(--color-border2)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--color-surface2)', color: 'var(--color-red)' }}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h3
              id="confirm-delete-title"
              className="m-0 text-[16px] font-extrabold tracking-tight"
            >
              Delete {businessName}?
            </h3>
            <p
              className="mt-1 text-[12.5px] leading-relaxed"
              style={{ color: 'var(--color-text3)' }}
            >
              This cannot be undone. The lead card, all activity, meetings and notes will be
              permanently removed.
            </p>
            {error && (
              <p className="mt-2 text-[12px]" style={{ color: 'var(--color-red)' }}>
                {error}
              </p>
            )}
          </div>
        </div>
        <footer
          className="flex justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border px-3 py-2 text-[12.5px] font-bold disabled:opacity-50"
            style={{ borderColor: 'var(--color-border2)', color: 'var(--color-text2)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--color-red)' }}
          >
            {busy ? 'Deleting…' : 'Delete lead'}
          </button>
        </footer>
      </div>
    </div>
  );
}
