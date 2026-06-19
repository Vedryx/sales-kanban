import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { isPitchEmailEnabled } from '@/lib/env';

export const dynamic = 'force-dynamic';

// Tiny read-only endpoint so the client can disable the Send button + show
// a tooltip without leaking env state into the JS bundle. Session-gated:
// only signed-in SDRs see the flag.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ enabled: isPitchEmailEnabled });
}
