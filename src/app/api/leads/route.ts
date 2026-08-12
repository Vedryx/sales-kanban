import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../auth';
import { createManualLead, patchLeadPagespeed, patchLeadSecurity } from '@/lib/leads/write';
import { runPagespeed } from '@/lib/pagespeed/run';
import { runObservatory } from '@/lib/observatory/run';

// Mandatory: businessName. Everything else optional.
// Optional text fields accept '' from the form and are coerced to undefined.
// `website` and `email` also drop empty strings, but when present they are
// still validated as url() / email() respectively — half-typed values that
// won't pagespeed / can't send should hard-fail loudly at the API boundary.
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))
  .pipe(z.string().url().optional());

const optionalEmail = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))
  .pipe(z.string().email().optional());

const Body = z.object({
  businessName: z.string().trim().min(1),
  website: optionalUrl,
  email: optionalEmail,
  city: optionalText,
  state: optionalText,
  phone: optionalText,
  ownerName: optionalText,
});

export const dynamic = 'force-dynamic';
// PageSpeed runs in after() once the response is sent; mobile Lighthouse can
// take 20-40s. Keep the function alive long enough to finish + write back.
// Observatory runs in parallel via Promise.allSettled — adds no extra wall time.
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

  // Async scoring — runs after the response is sent so the SDR isn't blocked.
  // PSI (~20-40s) and Observatory (~2-8s) run in parallel via allSettled so
  // either failing never affects the other or the lead add. Best-effort: any
  // failure leaves the lead unscored / unrated rather than failing the flow.
  const { placeId, website } = card;
  if (website) {
    after(async () => {
      const [psiResult, obsResult] = await Promise.allSettled([
        runPagespeed(website),
        runObservatory(website),
      ]);

      if (psiResult.status === 'fulfilled') {
        try {
          await patchLeadPagespeed({ placeId, ...psiResult.value });
        } catch (err) {
          console.warn(`[pagespeed] persist failed for ${placeId}:`, (err as Error).message);
        }
      } else {
        console.warn(`[pagespeed] failed for ${placeId}:`, psiResult.reason?.message ?? psiResult.reason);
      }

      // Observatory returns null on any failure; only persist a non-null grade.
      if (obsResult.status === 'fulfilled' && obsResult.value) {
        try {
          await patchLeadSecurity({ placeId, grade: obsResult.value.grade, score: obsResult.value.score });
        } catch (err) {
          console.warn(`[observatory] persist failed for ${placeId}:`, (err as Error).message);
        }
      } else if (obsResult.status === 'rejected') {
        // runObservatory swallows errors internally; this path is defensive only.
        console.warn(`[observatory] unexpected reject for ${placeId}:`, obsResult.reason);
      }
    });
  }

  return NextResponse.json({ ok: true, lead: card });
}
