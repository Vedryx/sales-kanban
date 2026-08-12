import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tests for DELETE /api/leads/[placeId]. The route delegates all DB work
// to `deleteLead()` in @/lib/leads/write, so we mock that boundary and
// only exercise the auth gate + response shape.

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  deleteLeadMock: vi.fn(),
}));

vi.mock('../auth', () => ({
  auth: m.authMock,
}));

vi.mock('@/lib/leads/write', () => ({
  deleteLead: m.deleteLeadMock,
}));

// The other imports the route module pulls in still need mocks so its
// module-eval doesn't blow up. They're not exercised by DELETE, but the
// GET handler imports them at the top of the file.
vi.mock('@/lib/leads/read', () => ({
  getLeadDetail: vi.fn(),
}));
vi.mock('@/lib/activities/write', () => ({
  listActivities: vi.fn(),
}));
vi.mock('@/lib/meetings/service', () => ({
  listFutureMeetingsForLead: vi.fn(),
}));

import { DELETE } from '@/app/api/leads/[placeId]/route';

function req(): Request {
  return new Request('http://test/api/leads/p1', { method: 'DELETE' });
}
function params(placeId: string) {
  return { params: Promise.resolve({ placeId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('DELETE /api/leads/[placeId]', () => {
  it('returns 401 when no session', async () => {
    m.authMock.mockResolvedValue(null);
    const res = await DELETE(req(), params('p1'));
    expect(res.status).toBe(401);
    expect(m.deleteLeadMock).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no email', async () => {
    m.authMock.mockResolvedValue({ user: {} });
    const res = await DELETE(req(), params('p1'));
    expect(res.status).toBe(401);
    expect(m.deleteLeadMock).not.toHaveBeenCalled();
  });

  it('returns 200 + deletion counts on happy path', async () => {
    m.authMock.mockResolvedValue({ user: { email: 'sdr@vedryxtech.com' } });
    m.deleteLeadMock.mockResolvedValue({ valid: 1, state: 1, activities: 4, meetings: 1 });
    const res = await DELETE(req(), params('manual:abc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deleted: Record<string, number> };
    expect(body.ok).toBe(true);
    expect(body.deleted).toEqual({ valid: 1, state: 1, activities: 4, meetings: 1 });
    expect(m.deleteLeadMock).toHaveBeenCalledWith('manual:abc');
  });

  it('returns 200 + zero counts when nothing matched (idempotent)', async () => {
    // We chose 200-with-zeros over 404 so a second-tab race (already deleted)
    // isn't misread as a network failure. Route contract: 200 always on
    // successful auth + successful DB call, regardless of match count.
    m.authMock.mockResolvedValue({ user: { email: 'sdr@vedryxtech.com' } });
    m.deleteLeadMock.mockResolvedValue({ valid: 0, state: 0, activities: 0, meetings: 0 });
    const res = await DELETE(req(), params('missing'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deleted: Record<string, number> };
    expect(body.ok).toBe(true);
    expect(body.deleted.valid).toBe(0);
    expect(body.deleted.state).toBe(0);
    expect(body.deleted.activities).toBe(0);
    expect(body.deleted.meetings).toBe(0);
  });
});
