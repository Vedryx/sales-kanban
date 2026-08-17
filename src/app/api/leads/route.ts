import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../auth';
import {
  createManualLead,
  patchLeadPagespeed,
  patchLeadSecurity,
  patchLeadState,
} from '@/lib/leads/write';
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

// Section — free-text taxonomy tag (see sales-kanban-sections work). Same
// trim + empty→undefined coercion as the other optional text fields; the
// PATCH /state route re-normalizes on the write path (empty → null there).
// Capped at 60 chars to match the PATCH boundary.
const optionalSection = z
  .string()
  .max(60)
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const Body = z.object({
  businessName: z.string().trim().min(1),
  website: optionalUrl,
  email: optionalEmail,
  city: optionalText,
  state: optionalText,
  phone: optionalText,
  ownerName: optionalText,
  section: optionalSection,
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

  // Split section out — createManualLead writes valid_pulse_leads only;
  // section lives on sk_lead_state and is upserted via patchLeadState.
  const { section, ...manualLeadFields } = parsed.data;
  const card = await createManualLead({
    ...manualLeadFields,
    sdrEmail: session.user.email,
    sdrName: session.user.name ?? undefined,
  });

  // If the SDR set a section at add-lead time, upsert it onto the state
  // doc via the same helper the PATCH /state route uses. Kept as a chained
  // call (rather than widening createManualLead) so the two write paths
  // stay one-collection-each — see cto.md §2.1 boundary reasoning.
  let responseCard = card;
  if (section) {
    try {
      await patchLeadState({
        placeId: card.placeId,
        sdrEmail: session.user.email,
        patch: { section },
      });
      responseCard = { ...card, section };
    } catch (err) {
      // Non-fatal — the lead exists; SDR can set the section from the pane.
      console.warn(
        `[lead-create] section upsert failed for ${card.placeId}:`,
        (err as Error).message,
      );
    }
  }

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

  return NextResponse.json({ ok: true, lead: responseCard });
}
