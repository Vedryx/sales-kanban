import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../auth';
import { createManualLead } from '@/lib/leads/write';

// Mandatory: businessName, website, email. Everything else optional.
// Optional text fields accept '' from the form and are coerced to undefined.
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const Body = z.object({
  businessName: z.string().trim().min(1),
  website: z.string().trim().url(),
  email: z.string().trim().email(),
  city: optionalText,
  state: optionalText,
  phone: optionalText,
  ownerName: optionalText,
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const card = await createManualLead({
    ...parsed.data,
    sdrEmail: session.user.email,
    sdrName: session.user.name ?? undefined,
  });

  return NextResponse.json({ ok: true, lead: card });
}
