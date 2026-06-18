'use client';
import type { LeadCard } from '@/types/lead';

export function Kpis({ leads }: { leads: LeadCard[] }) {
  const demoBooked = leads.filter(
    (l) => l.stage === 'demo_booked' || l.stage === 'quote_sent' || l.stage === 'verbal_yes',
  ).length;
  const dialing = leads.filter((l) => l.stage === 'dialing').length;
  const won = leads.filter((l) => l.stage === 'closed_won').length;
  // Pipeline value: stub for iter 1
  const pipelineValue = '—';

  const tiles: { label: string; value: string | number }[] = [
    { label: 'pipeline value', value: pipelineValue },
    { label: 'won this month', value: won },
    { label: 'dialing now', value: dialing },
    { label: 'demos booked', value: demoBooked },
  ];

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-lg border p-3"
          style={{ background: 'var(--color-bg2)', borderColor: 'var(--color-border)' }}
        >
          <div
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: 'var(--color-text3)' }}
          >
            {t.label}
          </div>
          <div className="mono mt-1 text-[18px] font-bold" style={{ color: 'var(--color-amber)' }}>
            {t.value}
          </div>
        </div>
      ))}
    </div>
  );
}
