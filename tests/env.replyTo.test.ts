import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Verifies REPLY_TO_EMAIL resolves correctly in the env zod schema:
// - explicit override is respected
// - default is the shared sales inbox on the verified domain
//
// We reset module cache via vi.resetModules between cases so the module-level
// zod parse runs fresh against the freshly-set process.env.

describe('env.REPLY_TO_EMAIL', () => {
  const originalReplyTo = process.env.REPLY_TO_EMAIL;
  const originalNodeEnv = (process.env as Record<string, string | undefined>).NODE_ENV;
  const originalMongo = process.env.MONGODB_URI;
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
  const originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    // Required envs must be present for the schema to parse cleanly so the
    // default branch in env.ts (parsed.success === true) is exercised.
    process.env.MONGODB_URI = 'mongodb://test';
    process.env.AUTH_SECRET = 'test';
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'x';
    vi.resetModules();
  });
  afterEach(() => {
    if (originalReplyTo === undefined) delete process.env.REPLY_TO_EMAIL;
    else process.env.REPLY_TO_EMAIL = originalReplyTo;
    if (originalNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalMongo === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongo;
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalGoogleId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalGoogleId;
    if (originalGoogleSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = originalGoogleSecret;
  });

  it('defaults to sales@vedryxtech.com when unset', async () => {
    delete process.env.REPLY_TO_EMAIL;
    const mod = await import('@/lib/env');
    expect(mod.env.REPLY_TO_EMAIL).toBe('sales@vedryxtech.com');
  });

  it('respects an explicit override', async () => {
    process.env.REPLY_TO_EMAIL = 'replies@example.com';
    const mod = await import('@/lib/env');
    expect(mod.env.REPLY_TO_EMAIL).toBe('replies@example.com');
  });
});
