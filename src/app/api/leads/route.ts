import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../auth';
import { createManualLead, patchLeadPagespeed } from '@/lib/leads/write';
import { runPagespeed } from '@/lib/pagespeed/run';

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
// PageSpeed runs in after() once the response is sent; mobile Lighthouse can
// take 20-40s. Keep the function alive long enough to finish + write back.
export const maxDuration = 60;

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

  // Async PageSpeed score — runs after the response is sent so the SDR isn't
  // blocked for ~30s. Best-effort: a failure leaves the lead unscored (the
  // card simply shows no pagespeed flag) rather than failing the add.
  const { placeId, website } = card;
  if (website) {
    after(async () => {
      try {
        const ps = await runPagespeed(website);
        await patchLeadPagespeed({ placeId, ...ps });
      } catch (err) {
        console.warn(`[pagespeed] failed for ${placeId}:`, (err as Error).message);
      }
    });
  }

  return NextResponse.json({ ok: true, lead: card });
}
