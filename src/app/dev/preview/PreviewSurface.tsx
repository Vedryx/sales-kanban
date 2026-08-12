'use client';
import { useEffect, useState } from 'react';
import { LeadDetailPane } from '@/components/lead/LeadDetailPane';
import { AddLeadModal } from '@/components/kanban/AddLeadModal';
import type { LeadDetail } from '@/types/lead';
import type { Activity } from '@/types/activity';

// Dev-only client-side wrapper for the preview page. Mocks window.fetch so
// the LeadDetailPane can hydrate against fixture data (no auth, no Mongo).
// Never mounts in production — the parent server component 404s in prod.
export function PreviewSurface({ view }: { view: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Safety belt: refuse to run in a real production build even if the
    // route somehow shipped. Keeps the fetch monkey-patch out of prod.
    if (process.env.NODE_ENV === 'production') return;

    const originalFetch = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      const detail: LeadDetail = {
        placeId: 'fx-detail',
        businessName: 'Sunrise Dental Group',
        city: 'Austin',
        state: 'TX',
        vertical: 'dentist',
        pagespeed: 42,
        pagespeedFlag: 'red',
        website: 'https://sunrise-dental.example',
        stage: 'connected',
        nextActionAt: new Date(Date.now() + 3600_000).toISOString(),
        nextActionIntent: 'send pitch',
        lastNote: 'Owner said email a proposal by Friday.',
        assignedTo: 'sdr@vedryxtech.com',
        hasEmail: true,
        hasPitchEmailSent: false,
        phone: '+1 512 555 0134',
        email: 'owner@sunrise-dental.example',
        ownerName: 'Dr. Rita Ahluwalia',
        timezone: 'America/Chicago',
        pagespeedMetrics: { LCP: '3.8s', INP: '210ms', CLS: '0.14' },
        pagespeedCategories: { performance: 42, accessibility: 88, bestPractices: 74, seo: 91 },
        pagespeedField: { lcpMs: 3800, inpMs: 210, cls: 0.14 },
        securityGrade: 'C',
        pitchEmailSentAt: null,
        pitchEmailLastError: null,
        quote: { amount: 2500, currency: 'USD', sentAt: new Date().toISOString() },
        deal: { amount: null, currency: 'USD', closedAt: null },
        deposit: { amount: null, paidAt: null },
      };
      const activities: Activity[] = [
        {
          _id: 'a1',
          leadPlaceId: 'fx-detail',
          sdrEmail: 'sdr@vedryxtech.com',
          type: 'disposition',
          payload: { code: 'connected', intent: 'send pitch' },
          createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
        {
          _id: 'a2',
          leadPlaceId: 'fx-detail',
          sdrEmail: 'sdr@vedryxtech.com',
          type: 'lead_created',
          payload: { businessName: 'Sunrise Dental Group' },
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ];

      if (url.includes('/api/leads/fx-detail') && !url.includes('/mark-read')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, lead: detail, activities, futureMeetings: 0 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      if (url.includes('/mark-read')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (url.includes('/api/pitch-email-config')) {
        return Promise.resolve(
          new Response(JSON.stringify({ enabled: true }), { status: 200 }),
        );
      }
      if (url.includes('/api/inbound/unread')) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, unread: [] }), { status: 200 }),
        );
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;

    setReady(true);
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  if (!ready) return <div style={{ padding: 20, color: '#888' }}>Preview loading…</div>;

  if (view === 'detail') {
    return (
      <div className="min-h-screen w-screen" style={{ background: 'var(--color-bg)' }}>
        <LeadDetailPane
          placeId="fx-detail"
          onClose={() => {
            /* no-op */
          }}
          onBook={() => {
            /* no-op */
          }}
          onPatched={() => {
            /* no-op */
          }}
          onDeleted={() => {
            /* no-op */
          }}
        />
      </div>
    );
  }

  if (view === 'addlead') {
    return (
      <div className="min-h-screen w-screen" style={{ background: 'var(--color-bg)' }}>
        <AddLeadModal
          onClose={() => {
            /* no-op */
          }}
          onCreated={() => {
            /* no-op */
          }}
        />
      </div>
    );
  }

  return <div style={{ padding: 20 }}>Unknown view: {view}</div>;
}
