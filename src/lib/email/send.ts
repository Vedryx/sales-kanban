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
  // Personal display name for the From header. Combined with the verified
  // sending address so the email reads as a person (e.g. "Dev Saini
  // <hello@pulse.vedryxtech.com>"), not the brand — a Primary-tab signal.
  // Ignored when `from` is passed explicitly.
  fromName?: string;
  replyTo?: string;
};

// Pull the bare address out of a possibly-display-named From string.
// "Vedryx Pulse <hello@x.com>" -> "hello@x.com"; "hello@x.com" -> "hello@x.com".
export function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

// Make an arbitrary name safe to drop into a From display-name. Strips
// header-injection chars (< > " \ CR LF) and quotes the name when it contains
// RFC-5322 specials (comma, etc.) that would otherwise break the header.
export function sanitizeDisplayName(name: string): string {
  const cleaned = name.replace(/[<>"\\\r\n]/g, '').trim();
  if (!cleaned) return '';
  return /[(),:;@[\]]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

// Resolve the final From header. Explicit `from` wins; else a sanitized
// display name over the configured sending address; else the configured From.
export function composeFrom(
  opts: { from?: string; fromName?: string },
  configuredFrom: string,
): string {
  if (opts.from) return opts.from;
  if (opts.fromName) {
    const name = sanitizeDisplayName(opts.fromName);
    if (name) return `${name} <${addressOf(configuredFrom)}>`;
  }
  return configuredFrom;
}

export async function sendEmail(opts: SendEmailOpts): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('config_missing:RESEND_API_KEY');
  }
  // Default address must be on a Resend-VERIFIED domain. team.vedryxtech.com is
  // verified; pulse.vedryxtech.com is NOT (it 403s). Prod overrides via
  // PITCH_EMAIL_FROM, but the fallback must still be sendable.
  const configuredFrom =
    process.env.PITCH_EMAIL_FROM ?? 'Vedryx Pulse <hello@team.vedryxtech.com>';
  const from = composeFrom(opts, configuredFrom);

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
