'use client';
import { useMemo, useState } from 'react';
import { Video, Phone, MapPin } from 'lucide-react';
import { formatTimeRange } from '@/lib/utils';
import type { Meeting } from '@/types/meeting';

export function MeetingsQueue({
  today,
  tomorrow,
  sdrName,
}: {
  today: Meeting[];
  tomorrow: Meeting[];
  sdrName: string;
}) {
  const now = Date.now();

  const { live, upcoming, done } = useMemo(() => {
    const live: Meeting[] = [];
    const upcoming: Meeting[] = [];
    const done: Meeting[] = [];
    for (const m of today) {
      const start = new Date(m.startAt).getTime();
      const end = new Date(m.endAt).getTime();
      if (now >= start && now <= end) live.push(m);
      else if (now > end) done.push(m);
      else upcoming.push(m);
    }
    return { live, upcoming, done };
  }, [today, now]);

  // Coming-up tomorrow: COLLAPSED by default (founder #5)
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  const totalMin = today.reduce((acc, m) => acc + m.durationMin, 0);
  const isEmpty = today.length === 0;
  const dateLabel = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header
        className="border-b max-lg:px-4 max-lg:py-4 lg:px-7 lg:py-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-end justify-between max-sm:flex-col max-sm:items-start max-sm:gap-1">
          <div>
            <h1 className="m-0 text-[23px] font-extrabold tracking-tight">Today&apos;s Meetings</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text3)' }}>
              {sdrName} · {dateLabel}
            </p>
          </div>
          <div className="mono text-[14px] font-semibold" style={{ color: 'var(--color-amber)' }}>
            {today.length} meeting{today.length === 1 ? '' : 's'} · {Math.floor(totalMin / 60)}h{' '}
            {totalMin % 60}m
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto max-lg:px-4 max-lg:py-4 lg:px-7 lg:py-5">
        <div className="mx-auto max-w-[780px]">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <>
              {live.length > 0 && (
                <div className="sticky top-0 z-10 mb-3 pt-1">
                  {live.map((m) => (
                    <NowStrip key={m._id} m={m} />
                  ))}
                </div>
              )}

              <SectionLabel>Upcoming</SectionLabel>
              {upcoming.length === 0 && (
                <div className="text-[12px]" style={{ color: 'var(--color-text3)' }}>
                  Nothing else today.
                </div>
              )}
              {upcoming.map((m) => (
                <MeetingRow key={m._id} m={m} />
              ))}

              {done.length > 0 && (
                <button
                  onClick={() => setDoneOpen((v) => !v)}
                  className="mt-6 flex w-full items-center gap-2 rounded-md border px-4 py-2.5 text-[12.5px]"
                  style={{
                    background: 'var(--color-bg2)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text3)',
                  }}
                >
                  {doneOpen ? '▾' : '▸'} Done today ({done.length})
                </button>
              )}
              {doneOpen && done.map((m) => <MeetingRow key={m._id} m={m} dim />)}
            </>
          )}

          {/* Coming up tomorrow — collapsed by default */}
          <div className="mt-8">
            <button
              onClick={() => setTomorrowOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-md border px-4 py-2.5 text-[12.5px]"
              style={{
                background: 'var(--color-bg2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text3)',
              }}
            >
              {tomorrowOpen ? '▾' : '▸'} Coming up tomorrow ({tomorrow.length})
            </button>
            {tomorrowOpen && tomorrow.map((m) => <MeetingRow key={m._id} m={m} dim />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-3 px-1 text-[10.5px] font-bold tracking-wider uppercase"
      style={{ color: 'var(--color-text3)' }}
    >
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-xl border p-10 text-center"
      style={{ background: 'var(--color-bg2)', borderColor: 'var(--color-border)' }}
    >
      <div className="text-[14px] font-semibold">No meetings scheduled for today.</div>
      <div className="mt-2 text-[12.5px]" style={{ color: 'var(--color-text3)' }}>
        Book one from the Pipeline — open any lead card and hit{' '}
        <span className="mono">+ Book G-Meet</span>.
      </div>
      <a
        href="/board"
        className="mt-4 inline-block rounded-md px-4 py-2 text-[12.5px] font-bold"
        style={{ background: 'var(--color-amber)', color: '#1b1715' }}
      >
        Open Pipeline →
      </a>
    </div>
  );
}

function TypeIcon({ t }: { t: Meeting['meetingType'] }) {
  if (t === 'phone') return <Phone size={14} />;
  if (t === 'inperson') return <MapPin size={14} />;
  return <Video size={14} />;
}

function NowStrip({ m }: { m: Meeting }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(131,194,141,0.10), rgba(131,194,141,0.04))',
        borderColor: 'rgba(131,194,141,0.35)',
        boxShadow: '0 0 24px rgba(131,194,141,0.10)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="mono text-[14px] font-semibold"
          style={{ color: 'var(--color-green)' }}
        >
          {formatTimeRange(m.startAt, m.endAt)}
        </div>
        <span className="live-dot" />
        <span
          className="text-[10.5px] font-bold tracking-wider uppercase"
          style={{ color: 'var(--color-green)' }}
        >
          Live
        </span>
        <div className="flex-1 text-[14px] font-bold">{m.leadBusinessName}</div>
        {m.meetingUrl && (
          <a
            target="_blank"
            rel="noreferrer"
            href={m.meetingUrl}
            className="rounded-md px-3 py-1.5 text-[12px] font-bold"
            style={{ background: 'var(--color-green)', color: '#1b1715' }}
          >
            Join ▶
          </a>
        )}
      </div>
      {m.agenda && (
        <div className="mt-2 text-[12.5px] italic" style={{ color: 'var(--color-text2)' }}>
          &ldquo;{m.agenda}&rdquo;
        </div>
      )}
    </div>
  );
}

function MeetingRow({ m, dim }: { m: Meeting; dim?: boolean }) {
  return (
    <div
      className="mb-2 flex gap-4 rounded-xl border px-4 py-3 max-md:flex-col max-md:gap-2 md:items-center"
      style={{
        background: 'var(--color-bg2)',
        borderColor: 'var(--color-border)',
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div className="shrink-0 max-md:flex max-md:items-baseline max-md:gap-2 md:w-[74px]">
        <div className="mono text-[14px] font-semibold" style={{ color: 'var(--color-amber)' }}>
          {formatTimeRange(m.startAt, m.endAt)}
        </div>
        <div className="text-[10px] max-md:mt-0 md:mt-0.5" style={{ color: 'var(--color-text3)' }}>
          {m.durationMin}m
        </div>
      </div>
      <div className="w-px self-stretch max-md:hidden" style={{ background: 'var(--color-border2)' }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TypeIcon t={m.meetingType} />
          <div className="text-[14px] font-bold tracking-tight">{m.leadBusinessName}</div>
          <div className="text-[12.5px]" style={{ color: 'var(--color-text2)' }}>
            — {m.title.replace(/^\[PREVIEW\]\s*/, '')}
          </div>
        </div>
        {m.agenda && (
          <div className="mt-1 truncate text-[12px] italic" style={{ color: 'var(--color-text2)' }}>
            &ldquo;{m.agenda}&rdquo;
          </div>
        )}
      </div>
      {m.meetingUrl && !dim && (
        <a
          target="_blank"
          rel="noreferrer"
          href={m.meetingUrl}
          className="rounded-md border px-3 py-1.5 text-[12px] max-md:w-full max-md:text-center"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border2)',
            color: 'var(--color-text)',
          }}
        >
          Join ↗
        </a>
      )}
    </div>
  );
}
