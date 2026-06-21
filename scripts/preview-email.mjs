#!/usr/bin/env node
// Render the pitch email (HTML + plain text) against a sample lead with the
// new inline scorecard fully populated, then write to tmp/preview.html and
// tmp/preview.txt for visual inspection in a browser / text editor.
//
// Usage:
//   node scripts/preview-email.mjs
//
// Why .mjs / esbuild bundle? template.ts is a TS file. We compile it on the
// fly with esbuild so this script stays zero-config (no separate build step).
// esbuild is already a transitive dep via Next.

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const sample = {
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
  customNote: null,
  sdrName: 'Dev',
};

async function compileTemplate() {
  // Bundle template.ts → a single ESM string we can import via data: URL.
  const result = await build({
    entryPoints: [resolve(root, 'src/lib/email/template.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    // Strip the @/types import — it's type-only, so no runtime impact, but
    // esbuild still needs to resolve it. Mark types path as external; types
    // get erased in the output anyway.
    external: ['@/types/lead'],
    // Map the only runtime path in template.ts. Currently none (type-only),
    // but keep this defensive.
    alias: { '@': resolve(root, 'src') },
  });
  return result.outputFiles[0].text;
}

async function main() {
  const bundle = await compileTemplate();
  // Write the bundled template to a temp file and import it as ESM. Using a
  // file URL keeps the import resolver happy (data: URLs hit subpath-import
  // issues in Node 20).
  const tmpDir = resolve(root, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const compiledPath = join(tmpDir, '_compiled_template.mjs');
  await writeFile(compiledPath, bundle, 'utf8');
  const mod = await import(pathToFileURL(compiledPath).href);
  const { renderPitchEmail } = mod;

  const rendered = renderPitchEmail(sample);
  await writeFile(join(tmpDir, 'preview.html'), rendered.html, 'utf8');
  await writeFile(join(tmpDir, 'preview.txt'), rendered.text, 'utf8');

  // Optional minimal preview variants — useful for visual diffing.
  const noCategories = renderPitchEmail({
    ...sample,
    pagespeed: { ...sample.pagespeed, categories: undefined, field: undefined },
    securityGrade: null,
  });
  await writeFile(join(tmpDir, 'preview.legacy.html'), noCategories.html, 'utf8');

  const noCrux = renderPitchEmail({
    ...sample,
    pagespeed: { ...sample.pagespeed, field: undefined },
  });
  await writeFile(join(tmpDir, 'preview.no-crux.html'), noCrux.html, 'utf8');

  const noSecurity = renderPitchEmail({ ...sample, securityGrade: null });
  await writeFile(join(tmpDir, 'preview.no-security.html'), noSecurity.html, 'utf8');

  console.log('Wrote:');
  console.log(`  ${join(tmpDir, 'preview.html')}      (full scorecard)`);
  console.log(`  ${join(tmpDir, 'preview.txt')}       (plain text)`);
  console.log(`  ${join(tmpDir, 'preview.legacy.html')} (no categories → legacy single-score line)`);
  console.log(`  ${join(tmpDir, 'preview.no-crux.html')} (categories present, CrUX absent → lab fallback)`);
  console.log(`  ${join(tmpDir, 'preview.no-security.html')} (no security grade → row spans 4 cols)`);
  console.log(`\nOpen the HTML files in a browser to eyeball the scorecard.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
