import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    preview: process.env.PREVIEW_MODE === 'true',
    ts: Date.now(),
  });
}
