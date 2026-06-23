import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/collections';
import { writeActivity } from '@/lib/activities/write';
import { patchLeadState } from '@/lib/leads/write';
import {
  bareEmail,
  sanitizeInboundHtml,
  snippetFromText,
  stripAngles,
} from '@/lib/email/sanitizeInbound';

// Inbound reply webhook (Resend → us).
//
// Why this exists: outbound pitch emails set Reply-To = sales@vedryxtech.com.
// That mailbox forwards a copy to Resend's inbound receiving address, which
// in turn fires this webhook with the email metadata. We fetch the full body
// via `resend.emails.receiving.get(email_id)`, match it to a lead, and
// persist a sanitized snapshot as an `inbound_reply` activity. The board
// polls / re-fetches and shows a toast + unread badge (PR 3 wires the UI).
//
// Security model:
//   - Resend signs every delivery with svix. We REJECT (401) any payload
//     whose signature does not verify against RESEND_WEBHOOK_SECRET.
//   - Inbound HTML is UNTRUSTED — sanitized at THIS write path via
//     sanitizeInboundHtml() and only the sanitized version is stored.
//   - Every non-signature failure returns 200 so Resend does not retry-loop
//     us into oblivion. Errors are logged for triage.

export const dynamic = 'force-dynamic';

type ReceivingEmailHeaders = Record<string, string> | null;
type ReceivingEmailSuccess = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: ReceivingEmailHeaders;
  message_id: string;
  created_at: string;
};

function getHeader(headers: ReceivingEmailHeaders, name: string): string | null {
  if (!headers) return null;
  // Header names are case-insensitive — Resend returns them lowercased in
  // practice but we don't want to depend on that.
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Production should always have the secret set. Treat missing secret as
    // 401 (no verification possible) rather than 200 — otherwise a
    // misconfigured deploy would silently swallow forged webhooks.
    console.error('[inbound/reply] RESEND_WEBHOOK_SECRET not set');
    return NextResponse.json({ ok: false, error: 'config_missing' }, { status: 401 });
  }

  // svix verification needs the EXACT raw bytes — JSON.parse first then
  // re-stringify would mutate whitespace and break the HMAC.
  const raw = await req.text();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Resend SDK declares `Headers` as { id, timestamp, signature } (svix
  // triplet), not the global Web Headers. Project req.headers down to that
  // shape; verify will reject if any field is missing/empty.
  const svixId = req.headers.get('svix-id') ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const svixSignature = req.headers.get('svix-signature') ?? '';

  let event: { type: string; data?: { email_id?: string; from?: string } };
  try {
    event = resend.webhooks.verify({
      payload: raw,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret: secret,
    }) as unknown as { type: string; data?: { email_id?: string; from?: string } };
  } catch (err) {
    console.warn('[inbound/reply] signature verify failed', err);
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }

  // Resend sends every email event type to a configured webhook URL. We only
  // act on `email.received`. Anything else: ack with 200 so Resend stops.
  if (event.type !== 'email.received') {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    console.warn('[inbound/reply] email.received without email_id');
    return NextResponse.json({ ok: true, ignored: 'no_email_id' });
  }

  // Fetch the full body. If this fails we still 200 (Resend retries non-2xx
  // and we don't want a transient API blip to lock the queue).
  let fullEmail: ReceivingEmailSuccess;
  try {
    const res = await resend.emails.receiving.get(emailId);
    if (res.error || !res.data) {
      console.error('[inbound/reply] receiving.get failed', res.error);
      return NextResponse.json({ ok: true, ignored: 'receiving_get_failed' });
    }
    fullEmail = res.data as unknown as ReceivingEmailSuccess;
  } catch (err) {
    console.error('[inbound/reply] receiving.get threw', err);
    return NextResponse.json({ ok: true, ignored: 'receiving_get_exception' });
  }

  const fromBare = bareEmail(fullEmail.from);
  const subject = fullEmail.subject ?? '';
  const text = fullEmail.text ?? '';
  const html = fullEmail.html ?? '';
  const headers = fullEmail.headers;
  const inReplyTo = stripAngles(getHeader(headers, 'in-reply-to'));
  const references = getHeader(headers, 'references') ?? null;
  const receivedAt = fullEmail.created_at ?? new Date().toISOString();

  // Sanitize ONCE at the write path. Never store raw HTML.
  const htmlSanitized = sanitizeInboundHtml(html);
  const snippetText = snippetFromText(text);

  // Match → primary by From address. We compare lowercased; the
  // valid_pulse_leads collection currently stores email as user-typed, so
  // we use a case-insensitive regex. (If/when the scraper normalises on
  // write we can switch to an indexed equality query.)
  const db = await getDb();
  let matchedPlaceId: string | null = null;
  let matchedBusinessName: string | null = null;
  if (fromBare) {
    const lead = await db.collection(COLLECTIONS.valid_pulse_leads).findOne(
      { email: { $regex: `^${escapeRegex(fromBare)}$`, $options: 'i' } },
      { projection: { placeId: 1, place_id: 1, name: 1, business: 1 } },
    );
    if (lead) {
      matchedPlaceId = (lead.placeId as string | undefined) ?? (lead.place_id as string | undefined) ?? null;
      matchedBusinessName = (lead.name as string | undefined) ?? (lead.business as string | undefined) ?? null;
    }
  }

  // Bonus signal: if no From-match, try matching by In-Reply-To against the
  // lastOutboundResendId we persisted on sk_lead_state when the pitch went
  // out. The Resend outbound `id` does NOT equal the RFC Message-ID, but
  // some providers echo it; harmless if it never hits. We keep this as a
  // pure secondary so the primary From-match path remains the contract.
  if (!matchedPlaceId && inReplyTo) {
    const state = await db.collection(COLLECTIONS.sk_lead_state).findOne(
      { lastOutboundResendId: inReplyTo },
      { projection: { leadPlaceId: 1 } },
    );
    if (state?.leadPlaceId) {
      matchedPlaceId = state.leadPlaceId as string;
    }
  }

  if (!matchedPlaceId) {
    // Triage queue. Small, ephemeral; intent is for the team to occasionally
    // glance at it and either attach manually or ignore.
    await db.collection(COLLECTIONS.sk_inbound_unmatched).insertOne({
      from: fromBare,
      fromRaw: fullEmail.from,
      subject,
      snippetText,
      htmlSanitized,
      inReplyTo: inReplyTo || null,
      references,
      resendEmailId: emailId,
      receivedAt: new Date(receivedAt),
      createdAt: new Date(),
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  // Matched — write an inbound_reply activity + flip unread flag.
  await writeActivity({
    leadPlaceId: matchedPlaceId,
    // System-origin write; we don't have an SDR session here. The board UI
    // already understands isSystem and renders accordingly.
    sdrEmail: 'inbound@vedryxtech.com',
    type: 'inbound_reply',
    payload: {
      from: fromBare,
      fromRaw: fullEmail.from,
      subject,
      snippetText,
      // Sanitized server-side via sanitizeInboundHtml() at THIS write path
      // — never render raw payload.text / payload.html on the client.
      htmlSanitized,
      resendEmailId: emailId,
      inReplyTo: inReplyTo || null,
      receivedAt,
      businessName: matchedBusinessName,
    },
    isSystem: true,
  });

  await patchLeadState({
    placeId: matchedPlaceId,
    sdrEmail: 'inbound@vedryxtech.com',
    patch: { unreadReplyAt: new Date(receivedAt).toISOString() },
  });

  return NextResponse.json({ ok: true, matched: true, placeId: matchedPlaceId });
}

// Escape user-controlled string for safe inclusion in a regex literal. We
// only build a regex from the bare-email From, but that string is fully
// attacker-controlled, so guard explicitly.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
