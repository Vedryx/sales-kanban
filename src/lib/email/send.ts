import 'server-only';

// One-screen Resend client. No SDK (saves ~80KB), no retry (modal owns retry),
// no queue (single-screen SDR flow — sub-second p95 send).
//
// Errors thrown follow a `<code>:<detail>` shape so the route handler can
// downcast to a UI-friendly message:
//   - 'config_missing:RESEND_API_KEY' — env not set
//   - 'resend_error:<status>:<body slice>' — Resend rejected
//   - 'network_error:<message>'             — fetch threw

export type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
};

export async function sendEmail(opts: SendEmailOpts): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('config_missing:RESEND_API_KEY');
  }
  const from =
    opts.from ??
    process.env.PITCH_EMAIL_FROM ??
    'Vedryx Pulse <hello@pulse.vedryxtech.com>';

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo,
      }),
    });
  } catch (err) {
    throw new Error(`network_error:${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`resend_error:${res.status}:${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}
