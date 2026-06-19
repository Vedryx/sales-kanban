import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '../src/lib/email/send';

describe('sendEmail', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalEnv;
  });

  it('throws config_missing when RESEND_API_KEY absent', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', html: '<p>h</p>' }),
    ).rejects.toThrow(/^config_missing:RESEND_API_KEY$/);
  });

  it('posts to resend api with expected shape and returns id', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend_msg_abc' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    const out = await sendEmail({
      to: 'a@b.com',
      subject: 'hi',
      html: '<p>hi</p>',
      text: 'hi',
      from: 'Test <test@example.com>',
      replyTo: 'reply@example.com',
    });

    expect(out.id).toBe('resend_msg_abc');
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test_key_123');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: 'Test <test@example.com>',
      to: 'a@b.com',
      subject: 'hi',
      html: '<p>hi</p>',
      text: 'hi',
      reply_to: 'reply@example.com',
    });
  });

  it('wraps non-2xx responses as resend_error', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{"message":"domain not verified"}', { status: 403 }),
      ) as unknown as typeof fetch;
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', html: '<p>h</p>' }),
    ).rejects.toThrow(/^resend_error:403:/);
  });

  it('wraps fetch failure as network_error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', html: '<p>h</p>' }),
    ).rejects.toThrow(/^network_error:ECONNREFUSED$/);
  });
});
