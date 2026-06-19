// Test-environment shim for Next's `server-only` module.
// In real Next builds, importing this package from a client component throws.
// In vitest (node env), we just want the import to succeed.
export {};
