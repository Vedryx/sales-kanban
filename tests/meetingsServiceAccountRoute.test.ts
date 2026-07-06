import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// The route depends on server-only + zod + the bookMeeting service. We don't
// want it actually hitting Google or Mongo, so every test in this file must
// hit the disabled-flag or unauthorized branches — the only paths that
// short-circuit before mintServiceAccountAccessToken() runs.
//
// vitest.config.ts already aliases 'server-only' to a no-op shim.

const ORIGINAL_ENV = { ...process.env };

async function loadRoute() {
  // Re-import after env mutation so module-init env reads (there aren't any
  // right now, but this future-proofs the test if we add module-level flags).
  const mod = await import('../src/app/api/meetings/service-account/route');
  return mod.POST;
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/meetings/service-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  leadPlaceId: 'p1',
  leadBusinessName: 'Test Co',
  leadEmail: 'lead@example.com',
  title: 'Vedryx demo',
  startISO: '2026-07-07T15:00:00.000Z',
  durationMin: 30,
  timezone: 'America/New_York',
  attendeeEmails: ['sdr@vedryxtech.com'],
  meetingType: 'gmeet',
  agenda: 'Say hi.',
};

describe('/api/meetings/service-account', () => {
  beforeEach(() => {
    // Force-flag-off + wipe any pre-set token so tests are deterministic.
    delete process.env.GOOGLE_SA_ENABLED;
    delete process.env.BRIDGE_SHARED_TOKEN;
    delete process.env.GOOGLE_SA_KEY_JSON;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns 503 when GOOGLE_SA_ENABLED is not "true"', async () => {
    const POST = await loadRoute();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.message)).toMatch(/disabled/);
  });

  it('returns 503 even when a matching bridge token is supplied (flag beats auth)', async () => {
    process.env.BRIDGE_SHARED_TOKEN = 'abc';
    const POST = await loadRoute();
    const res = await POST(makeRequest(VALID_BODY, { 'x-bridge-token': 'abc' }));
    expect(res.status).toBe(503);
  });

  it('returns 401 when flag is on but bridge token is missing', async () => {
    process.env.GOOGLE_SA_ENABLED = 'true';
    process.env.BRIDGE_SHARED_TOKEN = 'abc';
    const POST = await loadRoute();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 401 when flag is on but bridge token mismatches', async () => {
    process.env.GOOGLE_SA_ENABLED = 'true';
    process.env.BRIDGE_SHARED_TOKEN = 'abc';
    const POST = await loadRoute();
    const res = await POST(makeRequest(VALID_BODY, { 'x-bridge-token': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on bad body when flag+auth pass', async () => {
    process.env.GOOGLE_SA_ENABLED = 'true';
    process.env.BRIDGE_SHARED_TOKEN = 'abc';
    const POST = await loadRoute();
    const res = await POST(makeRequest({ nope: true }, { 'x-bridge-token': 'abc' }));
    expect(res.status).toBe(400);
  });
});
