import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tests for POST /api/leads (manual lead create). Focus is the zod schema —
// after the brief-driven relaxation, only businessName is required; website
// + email are optional, but must still validate as url() / email() when
// present. Downstream calls (createManualLead, pagespeed, observatory) are
// mocked so the test only exercises the request-parsing branches.

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  createLeadMock: vi.fn(),
  runPagespeedMock: vi.fn(),
  runObservatoryMock: vi.fn(),
  patchPagespeedMock: vi.fn(),
  patchSecurityMock: vi.fn(),
  patchStateMock: vi.fn(),
}));

vi.mock('../auth', () => ({ auth: m.authMock }));

vi.mock('@/lib/leads/write', () => ({
  createManualLead: m.createLeadMock,
  patchLeadPagespeed: m.patchPagespeedMock,
  patchLeadSecurity: m.patchSecurityMock,
  patchLeadState: m.patchStateMock,
}));

vi.mock('@/lib/pagespeed/run', () => ({ runPagespeed: m.runPagespeedMock }));
vi.mock('@/lib/observatory/run', () => ({ runObservatory: m.runObservatoryMock }));

// after() runs the pagespeed/observatory work post-response. In tests we
// don't need it to actually execute — just don't let it throw during import.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (_fn: () => void | Promise<void>) => { void _fn; } };
});

import { POST } from '@/app/api/leads/route';

function jsonReq(body: unknown): Request {
  return new Request('http://test/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.authMock.mockResolvedValue({ user: { email: 'sdr@vedryxtech.com', name: 'SDR' } });
  m.createLeadMock.mockResolvedValue({
    placeId: 'manual:test-1',
    businessName: 'Acme Inc',
    stage: 'new',
    hasEmail: false,
    hasPitchEmailSent: false,
  });
});

describe('POST /api/leads schema', () => {
  it('accepts businessName only (no website, no email)', async () => {
    const res = await POST(jsonReq({ businessName: 'Acme Inc' }));
    expect(res.status).toBe(200);
    expect(m.createLeadMock).toHaveBeenCalledOnce();
    const arg = m.createLeadMock.mock.calls[0][0];
    expect(arg.businessName).toBe('Acme Inc');
    expect(arg.website).toBeUndefined();
    expect(arg.email).toBeUndefined();
  });

  it('accepts businessName + optional city/phone (no website, no email)', async () => {
    const res = await POST(
      jsonReq({ businessName: 'Corner Cafe', city: 'Austin', phone: '+15551234567' }),
    );
    expect(res.status).toBe(200);
    const arg = m.createLeadMock.mock.calls[0][0];
    expect(arg.city).toBe('Austin');
    expect(arg.phone).toBe('+15551234567');
  });

  it('accepts empty-string website / email as if absent', async () => {
    const res = await POST(
      jsonReq({ businessName: 'A', website: '', email: '' }),
    );
    expect(res.status).toBe(200);
    const arg = m.createLeadMock.mock.calls[0][0];
    expect(arg.website).toBeUndefined();
    expect(arg.email).toBeUndefined();
  });

  it('rejects when businessName missing', async () => {
    const res = await POST(jsonReq({ website: 'https://acme.com' }));
    expect(res.status).toBe(400);
    expect(m.createLeadMock).not.toHaveBeenCalled();
  });

  it('rejects malformed website when present', async () => {
    const res = await POST(jsonReq({ businessName: 'A', website: 'not a url' }));
    expect(res.status).toBe(400);
    expect(m.createLeadMock).not.toHaveBeenCalled();
  });

  it('rejects malformed email when present', async () => {
    const res = await POST(jsonReq({ businessName: 'A', email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(m.createLeadMock).not.toHaveBeenCalled();
  });

  it('accepts valid website + email when present', async () => {
    const res = await POST(
      jsonReq({
        businessName: 'Acme Inc',
        website: 'https://acme.com',
        email: 'owner@acme.com',
      }),
    );
    expect(res.status).toBe(200);
    const arg = m.createLeadMock.mock.calls[0][0];
    expect(arg.website).toBe('https://acme.com');
    expect(arg.email).toBe('owner@acme.com');
  });

  it('returns 401 when no session', async () => {
    m.authMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ businessName: 'A' }));
    expect(res.status).toBe(401);
    expect(m.createLeadMock).not.toHaveBeenCalled();
  });

  it('accepts and forwards optional section — chains patchLeadState + returns section on the card', async () => {
    m.patchStateMock.mockResolvedValue(undefined);
    const res = await POST(jsonReq({ businessName: 'Acme Inc', section: 'Dental' }));
    expect(res.status).toBe(200);
    // createManualLead is called WITHOUT section (section is not part of
    // valid_pulse_leads; it lives on sk_lead_state).
    expect(m.createLeadMock).toHaveBeenCalledOnce();
    expect(m.createLeadMock.mock.calls[0][0].section).toBeUndefined();
    // patchLeadState is called with { section: 'Dental' }.
    expect(m.patchStateMock).toHaveBeenCalledOnce();
    const patchArg = m.patchStateMock.mock.calls[0][0];
    expect(patchArg.placeId).toBe('manual:test-1');
    expect(patchArg.patch).toEqual({ section: 'Dental' });
    // Response carries the section merged onto the returned card so the
    // Board's onCreated handler doesn't need to re-fetch.
    const body = await res.json();
    expect(body.lead.section).toBe('Dental');
  });

  it('trims whitespace on section (empty after trim → omitted, no patchLeadState call)', async () => {
    const res = await POST(jsonReq({ businessName: 'Acme', section: '   ' }));
    expect(res.status).toBe(200);
    expect(m.createLeadMock).toHaveBeenCalledOnce();
    expect(m.patchStateMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.lead.section).toBeUndefined();
  });

  it('rejects section over 60 chars', async () => {
    const long = 'a'.repeat(61);
    const res = await POST(jsonReq({ businessName: 'Acme', section: long }));
    expect(res.status).toBe(400);
    expect(m.createLeadMock).not.toHaveBeenCalled();
    expect(m.patchStateMock).not.toHaveBeenCalled();
  });
});
