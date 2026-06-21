import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '../../../../../auth';

// Vercel Blob client-upload handler.
// Flow:
//   1. Client calls @vercel/blob's `upload()` from PitchEmailModal.
//   2. SDK POSTs here with a "generate token" event.
//   3. We validate the session, return a scoped token allowing PUT to
//      `pitch-email/{placeId}/{timestamp}-{random}.{ext}` with content-type
//      and size constraints baked into the token.
//   4. Client uploads directly to Vercel Blob's storage (no proxy through us).
//   5. SDK callback fires `onUploadCompleted` — we log it as an audit trail.

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // Enforce path prefix server-side so a hostile client can't write
        // anywhere else in our blob bucket.
        if (!pathname.startsWith('pitch-email/')) {
          throw new Error('invalid_pathname');
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true,
          // No tokenPayload needed; we don't ferry per-user data through.
        };
      },
      onUploadCompleted: async () => {
        // Intentionally a no-op for v1. Could persist to sk_activities
        // later for forensic audit if we see misuse.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upload_failed';
    return NextResponse.json(
      { ok: false, error: 'upload_failed', message },
      { status: 400 },
    );
  }
}
