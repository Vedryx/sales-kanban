#!/usr/bin/env node
// Sends the rendered pitch email (with the full inline scorecard) to a Gmail
// address via Resend so the founder can verify Gmail Primary-tab placement
// end-to-end. Standalone — does not boot Next.js.
//
// Usage:
//   RESEND_API_KEY=re_xxx node scripts/send-test-email.mjs --to=someone@gmail.com
//   RESEND_API_KEY=re_xxx node scripts/send-test-email.mjs --to=a@gmail.com --variant=full|legacy|no-crux|no-security|full-inline-img
//
// Optional env:
//   PITCH_EMAIL_FROM   default: "Vedryx Pulse <hello@pulse.vedryxtech.com>"
//   SDR_NAME           default: "Dev"  (becomes the From display name)
//   SDR_REPLY_TO       default: omitted (Resend uses the From address)
//
// Why a standalone script? It exercises the EXACT same renderPitchEmail()
// output the production /api/leads/{id}/pitch-email route uses, but doesn't
// require the dev server, Mongo, auth, or a real lead. Founder just plugs in
// a Gmail address + Resend key and confirms Primary placement.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith('--')) out[a.slice(2)] = true;
  }
  return out;
}

const args = parseArgs();
const to = args.to;
const variant = args.variant || 'full';
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error('Required: --to=<email>  (must be a valid email; Gmail recommended for placement test)');
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('Required env: RESEND_API_KEY');
  process.exit(1);
}

// Default to the Resend-VERIFIED sending domain (team.vedryxtech.com). The old
// default (pulse.vedryxtech.com) is not verified in Resend and 403s on send.
const fromConfigured = process.env.PITCH_EMAIL_FROM ?? 'Dev Saini <hello@team.vedryxtech.com>';
const sdrName = process.env.SDR_NAME ?? 'Dev Saini';
const replyTo = process.env.SDR_REPLY_TO;

// Compose the From header — personal name over the verified sending address.
function addressOf(from) {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}
function sanitizeName(name) {
  const cleaned = name.replace(/[<>"\\\r\n]/g, '').trim();
  if (!cleaned) return '';
  return /[(),:;@[\]]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}
const fromHeader = `${sanitizeName(sdrName)} <${addressOf(fromConfigured)}>`;

const baseSample = {
  businessName: 'Acme Coffee Roasters',
  website: 'https://acmecoffee.example.com',
  pagespeed: {
    score: 34,
    flag: 'red',
    metrics: {
      'First Contentful Paint': '2.1s',
      'Largest Contentful Paint': '4.8s',
      'Total Blocking Time': '480ms',
      'Cumulative Layout Shift': '0.18',
      'Speed Index': '5.2s',
    },
    categories: {
      performance: 34,
      accessibility: 71,
      bestPractices: 83,
      seo: 91,
    },
    field: {
      lcpMs: 6200,
      inpMs: 410,
      fcpMs: 2100,
      cls: 0.12,
    },
  },
  securityGrade: 'F',
  demoUrl: 'https://pulse-demo.vedryxtech.com/acme-coffee',
  sdrName,
};

function pickSample(v) {
  switch (v) {
    case 'legacy':
      return {
        ...baseSample,
        pagespeed: { ...baseSample.pagespeed, categories: undefined, field: undefined },
        securityGrade: null,
      };
    case 'no-crux':
      return { ...baseSample, pagespeed: { ...baseSample.pagespeed, field: undefined } };
    case 'no-security':
      return { ...baseSample, securityGrade: null };
    case 'full-inline-img':
      // Same as `full` PLUS two inline screenshots. Uses picsum.photos so the
      // images are real, publicly fetchable, and won't 404 in Gmail. The
      // template now renders these as inline <img> tags (one per line, single
      // column, max-width 560px). Use this variant to re-test Gmail Primary
      // placement after the inline-image work.
      return {
        ...baseSample,
        screenshots: [
          { url: 'https://picsum.photos/seed/before/560/350', alt: 'before — current site hero' },
          { url: 'https://picsum.photos/seed/after/560/350', alt: 'after — rebuilt hero' },
        ],
      };
    case 'full':
    default:
      return baseSample;
  }
}

async function compileTemplate() {
  const result = await build({
    entryPoints: [resolve(root, 'src/lib/email/template.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    external: ['@/types/lead'],
    alias: { '@': resolve(root, 'src') },
  });
  return result.outputFiles[0].text;
}

async function main() {
  const bundle = await compileTemplate();
  const tmpDir = resolve(root, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const compiledPath = join(tmpDir, '_compiled_template.mjs');
  await writeFile(compiledPath, bundle, 'utf8');
  const mod = await import(pathToFileURL(compiledPath).href);
  const { renderPitchEmail } = mod;

  const sample = pickSample(variant);
  const rendered = renderPitchEmail(sample);

  console.log(`Sending [${variant}] pitch email to ${to} via Resend…`);
  console.log(`  From: ${fromHeader}`);
  if (replyTo) console.log(`  Reply-To: ${replyTo}`);
  console.log(`  Subject: ${rendered.subject}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromHeader,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      reply_to: replyTo,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Resend rejected: HTTP ${res.status}\n${body}`);
    process.exit(1);
  }
  let json;
  try { json = JSON.parse(body); } catch { json = { raw: body }; }
  console.log('Sent. Resend id:', json.id ?? json);
  console.log('\nNow open the destination Gmail inbox and check tab placement:');
  console.log('  - Primary  ✓  (target)');
  console.log('  - Promotions ✗ (thin scorecard further — drop CrUX row, then bars, then colors)');
  console.log('  - Updates / Spam ✗ (check sending-domain DNS / Resend domain verification)');
  console.log('\nVariants: full | legacy | no-crux | no-security | full-inline-img');
  console.log('Placement re-test: try --variant=full-inline-img and confirm Primary placement.');
  console.log('If it lands in Promotions, the link-form code path is still in place — revert via git or run --variant=full.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
