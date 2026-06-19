import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { getLeadDetail } from '@/lib/leads/read';
import { patchLeadState } from '@/lib/leads/write';
import { writeActivity } from '@/lib/activities/write';
import { renderPitchEmail } from '@/lib/email/template';
import { sendEmail } from '@/lib/email/send';
import { isPreview, isPitchEmailEnabled } from '@/lib/env';

const Screenshot = z.object({
  url: z.string().url().max(1000),
  alt: z.string().max(200).optional(),
});

const Body = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200).optional(),
  demoUrl: z
    .union([z.string().url(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  screenshots: z.array(Screenshot).max(3).default([]),
  customNote: z
    .union([z.string().max(500), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  pagespeed: z.object({
    score: z.number().int().min(0).max(100),
    flag: z.enum(['red', 'amber', 'green']),
    metrics: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  }),
});

export const dynamic = 'force-dynamic';
// Resend p95 ~600ms; we add DB writes. 15s is well above worst case.
export const maxDuration = 15;

function classifyError(err: unknown): {
  status: number;
  code: 'invalid_recipient' | 'resend_error' | 'config_missing' | 'rate_limited' | 'unknown';
  message: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith('config_missing:')) {
    return {
      status: 500,
      code: 'config_missing',
      message: 'Email sender not configured. Set RESEND_API_KEY in Vercel.',
    };
  }
  if (msg.startsWith('resend_error:')) {
    const parts = msg.split(':');
    const status = Number(parts[1]);
    if (status === 429) {
      return { status: 429, code: 'rate_limited', message: 'Resend rate limit hit. Wait a minute.' };
    }
    if (status === 403 || status === 422) {
      return {
        status: 502,
        code: 'resend_error',
        message:
          'Resend rejected the send. Domain probably not verified yet — check Resend → Domains.',
      };
    }
    return { status: 502, code: 'resend_error', message: msg.slice(0, 200) };
  }
  return { status: 500, code: 'unknown', message: msg.slice(0, 200) };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  // Kill-switch: feature OFF by default. Prevents accidental live sends
  // until founder flips PITCH_EMAIL_ENABLED=true in Vercel env after the
  // sending domain is verified and RESEND_API_KEY is provisioned.
  if (!isPitchEmailEnabled) {
    return NextResponse.json(
      { ok: false, error: 'disabled', message: 'Pitch email disabled' },
      { status: 503 },
    );
  }
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const sdrEmail = session.user.email;
  const sdrName = session.user.name ?? undefined;
  const { placeId } = await params;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'bad_request', message: parsed.error.message },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const lead = await getLeadDetail(placeId);
  if (!lead) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  // PREVIEW SAFETY: never send to a real lead in preview deployments.
  // Redirect every send to the SDR's own inbox. Same payload, same template,
  // so QA can verify rendering against real mail clients without risk.
  const recipient = isPreview ? sdrEmail : body.to;

  const rendered = renderPitchEmail({
    businessName: lead.businessName,
    website: lead.website,
    pagespeed: {
      score: body.pagespeed.score,
      flag: body.pagespeed.flag,
      metrics: body.pagespeed.metrics,
    },
    demoUrl: body.demoUrl ?? null,
    screenshots: body.screenshots,
    customNote: body.customNote ?? null,
    sdrName,
    subject: body.subject,
  });

  try {
    const { id: resendId } = await sendEmail({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: sdrEmail,
    });

    const sentAt = new Date().toISOString();
    await patchLeadState({
      placeId,
      sdrEmail,
      patch: { pitchEmailSentAt: sentAt, pitchEmailLastError: null },
    });
    await writeActivity({
      leadPlaceId: placeId,
      sdrEmail,
      sdrName,
      type: 'pitch_email',
      payload: {
        to: recipient,
        subject: rendered.subject,
        resendId,
        demoUrl: body.demoUrl ?? null,
        screenshotsCount: body.screenshots.length,
        customNoteLength: body.customNote?.length ?? 0,
        pagespeedSnapshot: { score: body.pagespeed.score, flag: body.pagespeed.flag },
        status: 'sent',
        previewRedirect: isPreview,
      },
    });

    return NextResponse.json({ ok: true, resendId, sentAt });
  } catch (err) {
    const classified = classifyError(err);
    await patchLeadState({
      placeId,
      sdrEmail,
      patch: { pitchEmailLastError: `${classified.code}: ${classified.message}`.slice(0, 300) },
    });
    await writeActivity({
      leadPlaceId: placeId,
      sdrEmail,
      sdrName,
      type: 'pitch_email',
      payload: {
        to: recipient,
        subject: rendered.subject,
        status: 'failed',
        error: classified.code,
        message: classified.message,
      },
    });
    return NextResponse.json(
      { ok: false, error: classified.code, message: classified.message },
      { status: classified.status },
    );
  }
}
