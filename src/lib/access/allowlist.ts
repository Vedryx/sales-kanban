import allowlist from '../../../allowlist.json';

/**
 * Email allowlist. A user may sign in only if their email is listed in
 * /allowlist.json. Edit that file + redeploy to grant or revoke access.
 */
const ALLOWED_EMAILS: ReadonlySet<string> = new Set(
  (allowlist.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
);

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export const allowedEmailCount = ALLOWED_EMAILS.size;
