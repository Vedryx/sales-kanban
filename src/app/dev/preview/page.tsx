import { notFound } from 'next/navigation';
import { Providers } from '../../providers';
import { Sidebar } from '@/components/layout/Sidebar';
import { Board } from '@/components/kanban/Board';
import { PreviewSurface } from './PreviewSurface';
import type { LeadCard } from '@/types/lead';
import { addDaysLocal, todayLocalDateString } from '@/lib/leads/reminderState';

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

// Derived at request time so the three reminder states (red/yellow/default)
// are always relative to "today" in the SDR's timezone. Prevents the fixture
// board from silently going all-red 3 days after being written.
function reminderFixtures() {
  const today = todayLocalDateString();
  return {
    overdue: addDaysLocal(today, -2), // red
    dueToday: today, // red
    inTwoDays: addDaysLocal(today, 2), // yellow
    farOut: addDaysLocal(today, 14), // default
  };
}

function buildFixtures(): LeadCard[] {
  const R = reminderFixtures();
  const nowIso = new Date().toISOString();
  return [
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
      nextReminderAt: null,
      latestMeetingSummary: null,
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
      nextReminderAt: R.dueToday,
      latestMeetingSummary: {
        text: 'Left voicemail — owner said try Wed AM. Interested in bundle.',
        at: nowIso,
        by: 'sdr@vedryxtech.com',
      },
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
      nextReminderAt: R.inTwoDays,
      latestMeetingSummary: {
        text: 'Demo booked for Friday. Sent the calendar invite; owner confirmed.',
        at: nowIso,
        by: 'sdr@vedryxtech.com',
      },
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
      nextReminderAt: R.overdue,
      latestMeetingSummary: null,
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
      nextReminderAt: R.farOut,
      latestMeetingSummary: {
        text: 'Legacy note preserved from the old Notes field pre-migration.',
        at: nowIso,
        by: 'legacy-note',
      },
      assignedTo: 'sdr@vedryxtech.com',
      hasEmail: true,
      hasPitchEmailSent: true,
    },
  ];
}

export default async function DevPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { view = 'board' } = await searchParams;
  const FIXTURE_LEADS = buildFixtures();

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
