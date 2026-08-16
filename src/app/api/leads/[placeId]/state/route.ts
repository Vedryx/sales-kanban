import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { patchLeadState } from '@/lib/leads/write';

const Body = z.object({
  // Calendar day (YYYY-MM-DD) in the SDR's local timezone. Empty string /
  // null clears the reminder. Strict regex — no ISO datetimes accepted at
  // this boundary; the UI is responsible for shipping a bare date. See
  // src/lib/leads/reminderState.ts for the model.
  nextReminderAt: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  // SDR-set email override; lives on sk_lead_state and shadows valid_pulse_leads.email.
  // Empty string → null (clears the override).
  email: z
    .union([z.string().email(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v)),
});

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const { placeId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  await patchLeadState({ placeId, sdrEmail: session.user.email, patch: parsed.data });
  return NextResponse.json({ ok: true });
}
