import { beforeEach, describe, expect, it, vi } from 'vitest';

// Asserts the pitch-email route passes env.REPLY_TO_EMAIL — not the SDR
// email — to sendEmail. Replies must land in the shared inbox so the
// inbound webhook can capture them onto the lead ticket.
//
// We mock every external dependency the route touches (next-auth, mongo
// readers/writers, the template, the env module, sendEmail itself) so the
// test only verifies the wiring of the reply-to value.

vi.mock('../auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { email: 'sdr@example.com', name: 'Test SDR' },
  }),
}));

vi.mock('@/lib/leads/read', () => ({
  getLeadDetail: vi.fn().mockResolvedValue({
    placeId: 'p1',
    businessName: 'Acme',
    website: 'https://acme.test',
    pagespeedCategories: undefined,
    pagespeedField: undefined,
    securityGrade: undefined,
  }),
}));

vi.mock('@/lib/leads/write', () => ({
  patchLeadState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/activities/write', () => ({
  writeActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email/template', () => ({
  renderPitchEmail: vi.fn().mockReturnValue({
    subject: 'subj',
    html: '<p>hi</p>',
    text: 'hi',
  }),
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'resend_msg_test' }),
}));

vi.mock('@/lib/env', () => ({
  env: { REPLY_TO_EMAIL: 'replies-test@vedryxtech.com' },
  isPreview: false,
  isPitchEmailEnabled: true,
}));

import { POST } from '@/app/api/leads/[placeId]/pitch-email/route';
import { sendEmail } from '@/lib/email/send';
import { patchLeadState } from '@/lib/leads/write';

describe('pitch-email route reply-to wiring', () => {
  beforeEach(() => {
    // Only reset call history. Do not restore the mock implementations —
    // they were declared with vi.mock(...) at module scope and need to keep
    // their resolved values across tests.
    vi.clearAllMocks();
    (sendEmail as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ id: 'resend_msg_test' });
  });

  it('passes env.REPLY_TO_EMAIL (not SDR email) as replyTo', async () => {
    const req = new Request('http://test/api/leads/p1/pitch-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: 'lead@example.com',
        pagespeed: { score: 60, flag: 'amber' },
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ placeId: 'p1' }) });
    if (res.status !== 200) {
      // Surface body for debugging when the route rejects.
      const body = await res.json();
      throw new Error(`route returned ${res.status}: ${JSON.stringify(body)}`);
    }
    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledOnce();
    const args = (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as { replyTo: string };
    expect(args.replyTo).toBe('replies-test@vedryxtech.com');
    expect(args.replyTo).not.toBe('sdr@example.com');
  });

  it('persists resendId on lead state as lastOutboundResendId', async () => {
    const req = new Request('http://test/api/leads/p1/pitch-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: 'lead@example.com',
        pagespeed: { score: 60, flag: 'amber' },
      }),
    });

    await POST(req, { params: Promise.resolve({ placeId: 'p1' }) });

    expect(patchLeadState).toHaveBeenCalledOnce();
    const patchArg = (patchLeadState as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { patch: { lastOutboundResendId?: string } };
    expect(patchArg.patch.lastOutboundResendId).toBe('resend_msg_test');
  });
});
