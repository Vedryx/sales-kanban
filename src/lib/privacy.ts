// Strip phone-shaped sequences from any text before logging.
// Matches: +1 555-555-5555, (210) 927-1400, +44 7700 900123, 555.555.5555 etc.
const PHONE_REGEX = /\+?\d[\d\s\-().]{8,}\d/g;
const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

export function redactPhone(input: unknown): string {
  if (input === null || input === undefined) return '';
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  return s.replace(PHONE_REGEX, '[redacted-phone]');
}

export function redactPII(input: unknown): string {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  return s.replace(PHONE_REGEX, '[redacted-phone]').replace(EMAIL_REGEX, '[redacted-email]');
}

// Safe logger: server-side. Strips phone before stdout.
export const safeLog = {
  info: (msg: string, meta?: unknown) => {
    // eslint-disable-next-line no-console
    console.log(redactPhone(msg), meta ? redactPhone(meta) : '');
  },
  warn: (msg: string, meta?: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(redactPhone(msg), meta ? redactPhone(meta) : '');
  },
  error: (msg: string, meta?: unknown) => {
    // eslint-disable-next-line no-console
    console.error(redactPhone(msg), meta ? redactPhone(meta) : '');
  },
};
