// Stub for the `server-only` sentinel package. `server-only` exists purely to
// throw at build time if a server module is bundled into a client bundle. When
// we bundle the same server modules into a standalone Node script (e.g. the
// backfill / send-test scripts), there is no client/server split — the sentinel
// is irrelevant. This empty module satisfies the import without side effects.
export {};
