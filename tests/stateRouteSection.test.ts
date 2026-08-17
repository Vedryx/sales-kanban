import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tests for PATCH /api/leads/[placeId]/state — section field. Covers the
// zod boundary: valid string, empty → null coercion, null clear, 60-char
// cap, no-op when section is undefined (partial patch).

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  patchStateMock: vi.fn(),
}));

vi.mock('../auth', () => ({ auth: m.authMock }));
vi.mock('@/lib/leads/write', () => ({ patchLeadState: m.patchStateMock }));

import { PATCH } from '@/app/api/leads/[placeId]/state/route';

function patchReq(body: unknown): Request {
  return new Request('http://test/api/leads/x/state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ placeId: 'manual:test-1' });

beforeEach(() => {
  vi.clearAllMocks();
  m.authMock.mockResolvedValue({ user: { email: 'sdr@vedryxtech.com', name: 'SDR' } });
  m.patchStateMock.mockResolvedValue(undefined);
});

describe('PATCH /state — section', () => {
  it('accepts a valid section string; writes it verbatim (server does not lower-case)', async () => {
    const res = await PATCH(patchReq({ section: 'Dental Sept Trade Show' }), { params });
    expect(res.status).toBe(200);
    const arg = m.patchStateMock.mock.calls[0][0];
    expect(arg.patch.section).toBe('Dental Sept Trade Show');
  });

  it('trims and preserves interior spacing', async () => {
    const res = await PATCH(patchReq({ section: '  HVAC  ' }), { params });
    expect(res.status).toBe(200);
    expect(m.patchStateMock.mock.calls[0][0].patch.section).toBe('HVAC');
  });

  it('empty string coerces to null (clears the section)', async () => {
    const res = await PATCH(patchReq({ section: '' }), { params });
    expect(res.status).toBe(200);
    expect(m.patchStateMock.mock.calls[0][0].patch.section).toBeNull();
  });

  it('whitespace-only coerces to null', async () => {
    const res = await PATCH(patchReq({ section: '     ' }), { params });
    expect(res.status).toBe(200);
    expect(m.patchStateMock.mock.calls[0][0].patch.section).toBeNull();
  });

  it('explicit null clears the section', async () => {
    const res = await PATCH(patchReq({ section: null }), { params });
    expect(res.status).toBe(200);
    expect(m.patchStateMock.mock.calls[0][0].patch.section).toBeNull();
  });

  it('rejects section over 60 chars', async () => {
    const long = 'x'.repeat(61);
    const res = await PATCH(patchReq({ section: long }), { params });
    expect(res.status).toBe(400);
    expect(m.patchStateMock).not.toHaveBeenCalled();
  });

  it('accepts exactly 60 chars', async () => {
    const at60 = 'x'.repeat(60);
    const res = await PATCH(patchReq({ section: at60 }), { params });
    expect(res.status).toBe(200);
    expect(m.patchStateMock.mock.calls[0][0].patch.section).toBe(at60);
  });

  it('omitting section entirely (no-op patch) does not surface a section key on the patch', async () => {
    const res = await PATCH(patchReq({ nextReminderAt: '2026-08-20' }), { params });
    expect(res.status).toBe(200);
    const patch = m.patchStateMock.mock.calls[0][0].patch;
    expect(patch.nextReminderAt).toBe('2026-08-20');
    expect(patch.section).toBeUndefined();
  });

  it('returns 401 without a session', async () => {
    m.authMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ section: 'Dental' }), { params });
    expect(res.status).toBe(401);
    expect(m.patchStateMock).not.toHaveBeenCalled();
  });
});
