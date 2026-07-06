import 'server-only';
import { google } from 'googleapis';

// Domain-wide-delegated (DWD) service-account access-token minting.
// Used by /api/meetings/service-account so a headless outbound agent can
// insert calendar events on behalf of a Workspace SDR without an interactive
// Google OAuth session. Only viable on Google Workspace tenants where the
// super-admin has authorised the service account for calendar.events.
//
// Env contract (all optional; the flag stays OFF until intentionally set):
//   GOOGLE_SA_KEY_JSON         Service-account JSON, either raw or base64.
//   GOOGLE_SA_IMPERSONATE_SUBJECT
//                              Workspace user to impersonate. Default:
//                              sales@vedryxtech.com.
//   GOOGLE_SA_ENABLED          'true' to enable the code path. Anything else
//                              (missing, 'false', empty) leaves it OFF and
//                              the route returns 503.

export const DEFAULT_IMPERSONATE_SUBJECT = 'sales@vedryxtech.com';
export const SA_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export function isServiceAccountEnabled(): boolean {
  return process.env.GOOGLE_SA_ENABLED === 'true';
}

type ServiceAccountKey = {
  client_email?: string;
  private_key?: string;
  // Any other fields are ignored — we only need the two above.
};

// Accepts either the raw JSON blob or a base64-encoded copy. The base64
// mode exists so Vercel env vars, which are single-line, can carry a key
// without the JSON-embedded newlines tripping shell quoting.
function parseKey(raw: string): ServiceAccountKey {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('GOOGLE_SA_KEY_JSON is empty');
  const looksJson = trimmed.startsWith('{');
  const jsonStr = looksJson
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonStr) as ServiceAccountKey;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SA_KEY_JSON missing client_email or private_key');
  }
  return parsed;
}

// Mint a fresh access token via DWD impersonation. Returns just the string
// so the caller can hand it straight to createCalendarEvent — no need for
// callers to depend on google-auth-library's client types.
export async function mintServiceAccountAccessToken(opts?: {
  subject?: string;
}): Promise<string> {
  if (!isServiceAccountEnabled()) {
    throw new Error('service-account path disabled (set GOOGLE_SA_ENABLED=true)');
  }
  const rawKey = process.env.GOOGLE_SA_KEY_JSON;
  if (!rawKey) throw new Error('GOOGLE_SA_KEY_JSON not set');
  const key = parseKey(rawKey);
  const subject =
    opts?.subject ||
    process.env.GOOGLE_SA_IMPERSONATE_SUBJECT ||
    DEFAULT_IMPERSONATE_SUBJECT;

  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SA_SCOPES,
    subject, // domain-wide-delegation impersonation target
  });

  const res = await jwt.authorize();
  if (!res.access_token) throw new Error('service-account token mint returned empty access_token');
  return res.access_token;
}
