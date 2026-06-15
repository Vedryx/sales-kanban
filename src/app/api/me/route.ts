import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({
    ok: true,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
}
