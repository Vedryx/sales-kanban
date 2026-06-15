import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { patchLeadMoney } from '@/lib/leads/write';

const MoneyField = z.enum(['quote', 'deal', 'deposit']);
const Body = z.object({
  field: MoneyField,
  amount: z.number().nonnegative().nullable(),
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
  await patchLeadMoney({
    placeId,
    sdrEmail: session.user.email,
    field: parsed.data.field,
    amount: parsed.data.amount,
  });
  return NextResponse.json({ ok: true });
}
