import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tests for /api/inbound/reply. The route depends on:
//   - new Resend(apiKey).webhooks.verify(...)
//   - resend.emails.receiving.get(emailId)
//   - getDb() → MongoDB collection facade
//   - writeActivity() / patchLeadState()
//
// We replace every dependency with vi.mock so the tests only exercise
// the route's branching logic + sanitization wiring, not Resend / Mongo.

// --- Mocks ------------------------------------------------------------------
// vi.mock() factories are hoisted above all top-level code, so any state
// they close over must be declared via vi.hoisted() to be available at
// hoist time. Without hoisted, the factories run before the const are
// initialized and we get a TDZ ReferenceError.

const m = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  receivingGetMock: vi.fn(),
  findOneLeadsMock: vi.fn(),
  findOneStateMock: vi.fn(),
  insertOneUnmatchedMock: vi.fn(),
  writeActivityMock: vi.fn(),
  patchLeadStateMock: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    webhooks: { verify: m.verifyMock },
    emails: { receiving: { get: m.receivingGetMock } },
  })),
}));

vi.mock('@/lib/mongo', () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: (name: string) => {
      if (name.startsWith('valid_pulse_leads')) {
        return { findOne: m.findOneLeadsMock };
      }
      if (name.startsWith('sk_lead_state')) {
        return { findOne: m.findOneStateMock };
      }
      if (name.startsWith('sk_inbound_unmatched')) {
        return { insertOne: m.insertOneUnmatchedMock };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  }),
}));

vi.mock('@/lib/activities/write', () => ({
  writeActivity: m.writeActivityMock,
}));

vi.mock('@/lib/leads/write', () => ({
  patchLeadState: m.patchLeadStateMock,
}));

const verifyMock = m.verifyMock;
const receivingGetMock = m.receivingGetMock;
const findOneLeadsMock = m.findOneLeadsMock;
const findOneStateMock = m.findOneStateMock;
const insertOneUnmatchedMock = m.insertOneUnmatchedMock;
const writeActivityMock = m.writeActivityMock;
const patchLeadStateMock = m.patchLeadStateMock;

// Import AFTER mocks so the route picks them up.
import { POST } from '@/app/api/inbound/reply/route';

// --- Helpers ----------------------------------------------------------------

function makeReq(body: string): Request {
  return new Request('http://test/api/inbound/reply', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_test',
      'svix-timestamp': '1700000000',
      'svix-signature': 'v1,sig',
    },
    body,
  });
}

const ORIGINAL_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const ORIGINAL_API_KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
  process.env.RESEND_API_KEY = 're_test';
});
afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_API_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_API_KEY;
});

// --- Tests ------------------------------------------------------------------

describe('/api/inbound/reply', () => {
  it('returns 401 when signature verification fails', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('bad sig');
    });

    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(401);
    expect(receivingGetMock).not.toHaveBeenCalled();
  });

  it('returns 401 when RESEND_WEBHOOK_SECRET missing', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('returns 200 + ignored for non-email.received events', async () => {
    verifyMock.mockReturnValue({ type: 'email.delivered', data: {} });
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ignored: string };
    expect(body.ok).toBe(true);
    expect(body.ignored).toBe('email.delivered');
    expect(receivingGetMock).not.toHaveBeenCalled();
  });

  it('writes activity + sets unreadReplyAt when From matches a lead', async () => {
    verifyMock.mockReturnValue({
      type: 'email.received',
      data: { email_id: 'inb_123', from: 'Lead <lead@example.com>' },
    });
    receivingGetMock.mockResolvedValue({
      data: {
        id: 'inb_123',
        from: 'Lead <lead@example.com>',
        to: ['sales@vedryxtech.com'],
        subject: 'Re: pitch',
        text: 'thanks for reaching out',
        html: '<p>thanks for reaching out</p>',
        headers: { 'in-reply-to': '<msg-outbound-1>' },
        message_id: '<msg-inbound-1>',
        created_at: '2026-06-23T10:00:00Z',
      },
      error: null,
    });
    findOneLeadsMock.mockResolvedValue({ placeId: 'lead-1', name: 'Acme Co' });

    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matched: boolean; placeId: string };
    expect(body.matched).toBe(true);
    expect(body.placeId).toBe('lead-1');

    expect(writeActivityMock).toHaveBeenCalledOnce();
    const activityArg = writeActivityMock.mock.calls[0][0];
    expect(activityArg.type).toBe('inbound_reply');
    expect(activityArg.leadPlaceId).toBe('lead-1');
    expect(activityArg.payload.from).toBe('lead@example.com');
    expect(activityArg.payload.subject).toBe('Re: pitch');
    // Sanitized version is what gets stored. Raw HTML never bypasses.
    expect(activityArg.payload.htmlSanitized).toMatch(/<p>thanks for reaching out<\/p>/);

    expect(patchLeadStateMock).toHaveBeenCalledOnce();
    const stateArg = patchLeadStateMock.mock.calls[0][0];
    expect(stateArg.placeId).toBe('lead-1');
    expect(stateArg.patch.unreadReplyAt).toBe('2026-06-23T10:00:00.000Z');
  });

  it('sanitizes <script> from inbound HTML before storing', async () => {
    verifyMock.mockReturnValue({
      type: 'email.received',
      data: { email_id: 'inb_xss', from: 'a@b.com' },
    });
    receivingGetMock.mockResolvedValue({
      data: {
        id: 'inb_xss',
        from: 'a@b.com',
        to: ['sales@vedryxtech.com'],
        subject: 'evil',
        text: 'pwn',
        html: '<p>ok</p><script>alert(document.cookie)</script>',
        headers: {},
        message_id: '<x>',
        created_at: new Date().toISOString(),
      },
      error: null,
    });
    findOneLeadsMock.mockResolvedValue({ placeId: 'lead-1', name: 'X' });

    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    const activityArg = writeActivityMock.mock.calls[0][0];
    expect(activityArg.payload.htmlSanitized).not.toMatch(/<script/i);
    expect(activityArg.payload.htmlSanitized).not.toMatch(/alert/i);
  });

  it('writes to sk_inbound_unmatched + still returns 200 when no match', async () => {
    verifyMock.mockReturnValue({
      type: 'email.received',
      data: { email_id: 'inb_nomatch', from: 'stranger@nowhere.test' },
    });
    receivingGetMock.mockResolvedValue({
      data: {
        id: 'inb_nomatch',
        from: 'stranger@nowhere.test',
        to: ['sales@vedryxtech.com'],
        subject: 'who?',
        text: 'cold inbound',
        html: '<p>cold inbound</p>',
        headers: {},
        message_id: '<m>',
        created_at: new Date().toISOString(),
      },
      error: null,
    });
    findOneLeadsMock.mockResolvedValue(null);
    findOneStateMock.mockResolvedValue(null);

    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matched: boolean };
    expect(body.matched).toBe(false);

    expect(insertOneUnmatchedMock).toHaveBeenCalledOnce();
    expect(writeActivityMock).not.toHaveBeenCalled();
    expect(patchLeadStateMock).not.toHaveBeenCalled();
  });

  it('returns 200 when receiving.get fails (no retry loop)', async () => {
    verifyMock.mockReturnValue({
      type: 'email.received',
      data: { email_id: 'inb_fail' },
    });
    receivingGetMock.mockResolvedValue({
      data: null,
      error: { message: 'boom', name: 'BoomError' },
    });

    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    expect(writeActivityMock).not.toHaveBeenCalled();
  });
});
