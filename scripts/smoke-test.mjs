// Tiny smoke test — hits /api/health (public) and /api/me (auth required).
// Usage: BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
const base = process.env.BASE_URL || 'http://localhost:3000';

const endpoints = [
  { path: '/api/health', expect: 200 },
  { path: '/api/me', expect: 401 }, // unauth response is the success case here
];

let fails = 0;
for (const e of endpoints) {
  try {
    const res = await fetch(base + e.path);
    const ok = res.status === e.expect;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${e.path} → ${res.status} (expected ${e.expect})`);
    if (!ok) fails++;
  } catch (err) {
    console.log(`FAIL ${e.path} → ${String(err)}`);
    fails++;
  }
}
process.exit(fails === 0 ? 0 : 1);
