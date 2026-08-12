import { notFound } from 'next/navigation';
import { Providers } from '../../providers';
import { Sidebar } from '@/components/layout/Sidebar';
import { Board } from '@/components/kanban/Board';
import { PreviewSurface } from './PreviewSurface';
import type { LeadCard } from '@/types/lead';

// Dev-only preview page for mobile-responsive verification.
// Renders one of three surfaces (?view=board | detail | addlead) with
// fixture data so playwright can take viewport-true screenshots + measure
// DOM geometry at 375 / 768 / 1280 without OAuth or a live Mongo.
//
// Guarded three ways so it never reaches production:
//   1. This handler returns 404 when NODE_ENV === 'production'.
//   2. middleware.ts short-circuits `/dev/*` only when NODE_ENV !== 'production'.
//   3. The client-side view (PreviewSurface) also gates on window.location.
export const dynamic = 'force-dynamic';

const FIXTURE_LEADS: LeadCard[] = [
  {
    placeId: 'fx-1',
    businessName: 'Sunrise Dental Group',
    city: 'Austin',
    state: 'TX',
    vertical: 'dentist',
    pagespeed: 42,
    pagespeedFlag: 'red',
    website: 'https://sunrise-dental.example',
    stage: 'new',
    nextActionAt: null,
    nextActionIntent: null,
    lastNote: null,
    assignedTo: null,
    hasEmail: true,
    hasPitchEmailSent: false,
  },
  {
    placeId: 'fx-2',
    businessName: 'Bay Area Family Law',
    city: 'San Jose',
    state: 'CA',
    vertical: 'lawyer',
    pagespeed: 71,
    pagespeedFlag: 'amber',
    website: 'https://bayfamlaw.example',
    stage: 'dialing',
    nextActionAt: new Date(Date.now() + 3600_000).toISOString(),
    nextActionIntent: 'follow-up call',
    lastNote: 'Left voicemail — try Wed AM.',
    assignedTo: 'sdr@vedryxtech.com',
    hasEmail: true,
    hasPitchEmailSent: true,
  },
  {
    placeId: 'fx-3',
    businessName: 'Peak HVAC & Cooling Solutions Northwest',
    city: 'Seattle',
    state: 'WA',
    vertical: 'hvac',
    pagespeed: 88,
    pagespeedFlag: 'green',
    website: 'https://peak-hvac.example',
    stage: 'demo_booked',
    nextActionAt: null,
    nextActionIntent: null,
    lastNote: null,
    assignedTo: 'sdr@vedryxtech.com',
    hasEmail: true,
    hasPitchEmailSent: true,
  },
  {
    placeId: 'fx-4',
    businessName: 'Redwood Realty',
    city: 'Portland',
    state: 'OR',
    vertical: 'realtor',
    pagespeed: 55,
    pagespeedFlag: 'amber',
    website: 'https://redwood.example',
    stage: 'connected',
    nextActionAt: null,
    nextActionIntent: null,
    lastNote: null,
    assignedTo: null,
    hasEmail: false,
    hasPitchEmailSent: false,
  },
  {
    placeId: 'fx-5',
    businessName: 'Northlake Auto Repair',
    city: 'Minneapolis',
    state: 'MN',
    vertical: 'auto',
    pagespeed: 33,
    pagespeedFlag: 'red',
    website: 'https://northlake.example',
    stage: 'quote_sent',
    nextActionAt: null,
    nextActionIntent: null,
    lastNote: null,
    assignedTo: 'sdr@vedryxtech.com',
    hasEmail: true,
    hasPitchEmailSent: true,
  },
];

export default async function DevPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { view = 'board' } = await searchParams;

  if (view === 'board') {
    return (
      <Providers>
        <div className="flex h-screen w-screen flex-col overflow-hidden lg:flex-row">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <Board initialLeads={FIXTURE_LEADS} />
          </main>
        </div>
      </Providers>
    );
  }

  // detail | addlead views render a client-side surface that mocks fetch()
  // so the real components hydrate against fixture data.
  return (
    <Providers>
      <PreviewSurface view={view} />
    </Providers>
  );
}
