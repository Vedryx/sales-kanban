#!/usr/bin/env node
// Dev-only mobile-responsive evidence script. Boots `next dev`, opens
// /dev/preview at 3 fixed viewports (375 / 768 / 1280), takes viewport
// screenshots, and measures DOM geometry for the key surfaces (board,
// LeadDetailPane, AddLeadModal). Writes screenshots + a geometry JSON
// to `EVIDENCE_DIR` (default: <cwd>/tmp/mobile-evidence).
//
// Usage:
//   node scripts/mobile-evidence.mjs
//   EVIDENCE_DIR=/some/path node scripts/mobile-evidence.mjs
//
// This script is developer-only. The /dev/preview route it hits is
// blocked by middleware.ts in production and 404s at the page level.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';

const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ??
  path.resolve(process.cwd(), 'tmp/mobile-evidence');

// Fixed viewports per the mobile-first brief.
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 }, // iPhone-shaped
  { name: '768', width: 768, height: 1024 }, // iPad portrait
  { name: '1280', width: 1280, height: 800 }, // Desktop
];

// Views registered by /dev/preview:
const VIEWS = ['board', 'detail', 'addlead'];

// Selectors we measure geometry for on each view. When a selector is missing
// (e.g. the AddLeadModal isn't in the board view), we skip silently.
const MEASURE_SELECTORS = {
  board: [
    { name: 'sidebar', selector: 'aside' },
    { name: 'board_root', selector: 'h1' }, // "Pipeline" header proxy
    { name: 'first_column', selector: 'main > div > div:nth-child(2) > div' }, // dnd column
    { name: 'add_lead_button', selector: 'button:has-text("Add lead")' },
    // sales-kanban-lead-reminders: card reminder-state markers. The three
    // states are set as `data-reminder-state="red|yellow|default"` on the
    // card root; measuring these confirms the design spec's colour states
    // are actually rendering.
    { name: 'card_reminder_red_first', selector: '[data-reminder-state="red"]' },
    { name: 'card_reminder_yellow_first', selector: '[data-reminder-state="yellow"]' },
    { name: 'card_reminder_default_first', selector: '[data-reminder-state="default"]' },
  ],
  detail: [
    { name: 'detail_aside', selector: 'aside' },
    { name: 'header_h2', selector: 'aside h2' },
    { name: 'book_button', selector: 'button:has-text("Book G-Meet")' },
    // sales-kanban-lead-reminders: the primary summaries block + reminder
    // input replace the retired disposition grid + next-action row.
    { name: 'summaries_block_header', selector: 'button[aria-expanded]' },
    { name: 'summary_composer_textarea', selector: 'textarea[maxlength="2000"]' },
    { name: 'reminder_date_input', selector: 'input[type="date"]' },
  ],
  addlead: [
    { name: 'modal_dialog', selector: 'h3:has-text("Add lead")' },
    { name: 'business_name_input', selector: 'input[placeholder="Acme Inc"]' },
    { name: 'submit_button', selector: 'button:has-text("Add lead"):not(:has-text("Cancel"))' },
  ],
};

async function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const sock = net.createConnection({ host: '127.0.0.1', port });
      sock.once('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.once('error', () => resolve(false));
    });
    if (ok) return;
    await delay(500);
  }
  throw new Error(`next dev did not open port ${port} within ${timeoutMs}ms`);
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  console.log('[mobile-evidence] booting next dev on :3111');
  const nextProc = spawn('npx', ['next', 'dev', '-p', '3111'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, NODE_ENV: 'development' },
  });

  try {
    await waitForPort(3111, 60_000);
    console.log('[mobile-evidence] next dev up, launching chromium');

    const browser = await chromium.launch();
    const geometry = { generatedAt: new Date().toISOString(), viewports: {} };

    for (const vp of VIEWPORTS) {
      geometry.viewports[vp.name] = { widthPx: vp.width, heightPx: vp.height, views: {} };
      for (const view of VIEWS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        const url = `http://127.0.0.1:3111/dev/preview?view=${view}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
          // Compile-on-first-hit + dnd-kit hydration + Board mount take a beat.
          await delay(700);
          const shotPath = path.join(EVIDENCE_DIR, `${view}-${vp.name}.png`);
          await page.screenshot({ path: shotPath, fullPage: false });
          console.log(`[mobile-evidence] ${view} @${vp.name}: ${shotPath}`);

          const selectors = MEASURE_SELECTORS[view] ?? [];
          const measured = {};
          for (const s of selectors) {
            try {
              const rect = await page.locator(s.selector).first().boundingBox({ timeout: 2000 });
              if (rect) {
                measured[s.name] = {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  w: Math.round(rect.width),
                  h: Math.round(rect.height),
                };
              } else {
                measured[s.name] = null;
              }
            } catch (err) {
              measured[s.name] = { error: err.message?.split('\n')[0] ?? String(err) };
            }
          }
          // Also grab document scroll dimensions to detect overflow leaks.
          const doc = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
          }));
          geometry.viewports[vp.name].views[view] = {
            screenshot: path.basename(shotPath),
            doc,
            measured,
          };
        } catch (err) {
          console.error(`[mobile-evidence] ${view} @${vp.name} FAILED:`, err.message);
          geometry.viewports[vp.name].views[view] = { error: err.message };
        }
        await context.close();
      }
    }

    await browser.close();

    const jsonPath = path.join(EVIDENCE_DIR, 'geometry.json');
    await writeFile(jsonPath, JSON.stringify(geometry, null, 2));
    console.log(`[mobile-evidence] wrote ${jsonPath}`);
  } finally {
    nextProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
