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
// - board          — ungrouped board (existing behaviour)
// - board-grouped  — swimlane mode; exercises the sales-kanban-sections work
// - detail         — LeadDetailPane over fixture data
// - addlead        — AddLeadModal
const VIEWS = ['board', 'board-grouped', 'detail', 'addlead'];

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
  'board-grouped': [
    { name: 'board_root', selector: 'h1' },
    { name: 'first_lane', selector: '[data-lane-key]' },
    { name: 'first_lane_header', selector: '[data-lane-header]' },
    // Column in the first lane — swimlane mode wraps each lane in a
    // [data-lane-key] container so we scope the column selector to it.
    { name: 'first_lane_first_column', selector: '[data-lane-key]:nth-of-type(1) [data-lane-header] ~ div > div' },
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

          // Swimlane-only assertions (design-lead.md §7). These are the
          // numeric evidence the founder's "no visually verified without
          // numbers" rule demands. Every claim in §2.2 has a check here.
          let swimlane = null;
          if (view === 'board-grouped') {
            swimlane = await page.evaluate((vpWidth) => {
              // Tolerance helpers per §7:
              //   #1 scrollWidth ≤ viewport
              //   #2 lane header height 40 (±1)
              //   #3 collapsed lane total height 40 (±1) — measured on click
              //   #4 column width 318.75 (±1) @375, 260 (±0.5) @768/1280
              //   #5 column body max-height 240 @375, 296 @768/1280
              //   #6 per-lane scroller scrollWidth > clientWidth
              //     + second lane independence: scrolling first stays 0 on second
              const lanes = Array.from(document.querySelectorAll('[data-lane-key]'));
              const firstLane = lanes[0] ?? null;
              const secondLane = lanes[1] ?? null;
              const firstLaneHeader = firstLane?.querySelector('[data-lane-header]') ?? null;
              const firstLaneScroller =
                firstLane?.querySelector('[data-lane-header] ~ div') ?? null;
              const secondLaneScroller =
                secondLane?.querySelector('[data-lane-header] ~ div') ?? null;
              const firstLaneFirstColumn = firstLaneScroller?.firstElementChild ?? null;
              // Column body is the second child of the column (header first).
              const firstLaneFirstColumnBody =
                firstLaneFirstColumn?.querySelector(':scope > div:nth-child(2)') ?? null;

              const laneHeaderH = firstLaneHeader?.getBoundingClientRect().height ?? null;
              const columnRect = firstLaneFirstColumn?.getBoundingClientRect() ?? null;
              const columnBodyMaxH = firstLaneFirstColumnBody
                ? parseFloat(getComputedStyle(firstLaneFirstColumnBody).maxHeight)
                : null;

              // Column width targets: 318.75 (±1) @375, 260 (±0.5) @768/1280.
              const expectedColumnWidth = vpWidth === 375 ? 318.75 : 260;
              const columnWidthTol = vpWidth === 375 ? 1 : 0.5;
              const columnWidthOk =
                columnRect != null &&
                Math.abs(columnRect.width - expectedColumnWidth) <= columnWidthTol;

              // Column body max-height targets: 240 @375, 296 @768/1280.
              const expectedBodyMax = vpWidth === 375 ? 240 : 296;
              const columnBodyMaxOk =
                columnBodyMaxH != null && Math.abs(columnBodyMaxH - expectedBodyMax) <= 1;

              // Per-lane scroller scrollWidth > clientWidth.
              const firstLaneScrollerScrollW = firstLaneScroller?.scrollWidth ?? null;
              const firstLaneScrollerClientW = firstLaneScroller?.clientWidth ?? null;
              const secondLaneScrollerScrollW = secondLaneScroller?.scrollWidth ?? null;
              const secondLaneScrollerClientW = secondLaneScroller?.clientWidth ?? null;

              // Independence check — snapshot second lane's initial
              // scrollLeft (may be non-zero when scroll-snap + padding
              // combine to move the initial position), scroll the first
              // lane, then assert the second lane's scrollLeft is
              // unchanged. Comparing to `=== 0` would false-negative on
              // the mobile edge-bleed layout where snap-mandatory rests
              // the scroller at a positive offset.
              let independenceOk = null;
              let firstLaneScrollBefore = null;
              let firstLaneScrollAfter = null;
              let secondLaneScrollBefore = null;
              let secondLaneScrollAfter = null;
              let sameScrollerRef = null;
              if (firstLaneScroller && secondLaneScroller) {
                sameScrollerRef = firstLaneScroller === secondLaneScroller;
                firstLaneScrollBefore = firstLaneScroller.scrollLeft;
                secondLaneScrollBefore = secondLaneScroller.scrollLeft;
                const step = (columnRect?.width ?? 260) + 12;
                firstLaneScroller.scrollLeft = step;
                firstLaneScrollAfter = firstLaneScroller.scrollLeft;
                secondLaneScrollAfter = secondLaneScroller.scrollLeft;
                independenceOk =
                  !sameScrollerRef && secondLaneScrollAfter === secondLaneScrollBefore;
              }

              return {
                laneCount: lanes.length,
                laneHeaderHeightPx: laneHeaderH,
                laneHeaderHeightOk:
                  laneHeaderH != null && Math.abs(laneHeaderH - 40) <= 1,
                columnWidthPx: columnRect?.width ?? null,
                columnWidthOk,
                columnBodyMaxHeightPx: columnBodyMaxH,
                columnBodyMaxHeightOk: columnBodyMaxOk,
                firstLaneScrollerScrollW,
                firstLaneScrollerClientW,
                firstLaneScrollerHasOverflow:
                  firstLaneScrollerScrollW != null &&
                  firstLaneScrollerClientW != null &&
                  firstLaneScrollerScrollW > firstLaneScrollerClientW,
                secondLaneScrollerScrollW,
                secondLaneScrollerClientW,
                secondLaneScrollerHasOverflow:
                  secondLaneScrollerScrollW != null &&
                  secondLaneScrollerClientW != null &&
                  secondLaneScrollerScrollW > secondLaneScrollerClientW,
                laneIndependenceOk: independenceOk,
                laneIndependenceDebug: {
                  firstLaneScrollBefore,
                  firstLaneScrollAfter,
                  secondLaneScrollBefore,
                  secondLaneScrollAfter,
                  sameScrollerRef,
                },
              };
            }, vp.width);

            // Collapsed-lane assertion (#3) — click the first lane header
            // to collapse it, remeasure the lane total height.
            try {
              await page.locator('[data-lane-header]').first().click();
              await delay(150);
              const collapsed = await page.evaluate(() => {
                const lane = document.querySelector('[data-lane-key]');
                return lane ? lane.getBoundingClientRect().height : null;
              });
              swimlane.collapsedLaneHeightPx = collapsed;
              swimlane.collapsedLaneHeightOk =
                collapsed != null && Math.abs(collapsed - 40) <= 1;
              // Reset — expand again so subsequent screenshots reflect
              // the default state.
              await page.locator('[data-lane-header]').first().click();
              await delay(100);
            } catch (err) {
              swimlane.collapsedLaneError = err.message?.split('\n')[0] ?? String(err);
            }

            // #1 doc scrollWidth ≤ viewport
            swimlane.pageOverflowOk = doc.scrollWidth <= vp.width;

            // Take an extra collapsed-state screenshot for the artifact set.
            try {
              await page.locator('[data-lane-header]').first().click();
              await delay(150);
              const collapsedShot = path.join(
                EVIDENCE_DIR,
                `${view}-collapsed-${vp.name}.png`,
              );
              await page.screenshot({ path: collapsedShot, fullPage: false });
              swimlane.collapsedScreenshot = path.basename(collapsedShot);
              await page.locator('[data-lane-header]').first().click();
              await delay(100);
            } catch (err) {
              swimlane.collapsedScreenshotError = err.message?.split('\n')[0] ?? String(err);
            }

            // Open the Section filter dropdown for a shot of the menu.
            try {
              await page.locator('button:has-text("Section:")').first().click();
              await delay(120);
              const menuShot = path.join(
                EVIDENCE_DIR,
                `${view}-section-menu-${vp.name}.png`,
              );
              await page.screenshot({ path: menuShot, fullPage: false });
              swimlane.sectionMenuScreenshot = path.basename(menuShot);
              // Close by pressing Escape so subsequent measurements aren't
              // affected by the open portal.
              await page.keyboard.press('Escape');
              await delay(80);
            } catch (err) {
              swimlane.sectionMenuScreenshotError =
                err.message?.split('\n')[0] ?? String(err);
            }
          }

          geometry.viewports[vp.name].views[view] = {
            screenshot: path.basename(shotPath),
            doc,
            measured,
            ...(swimlane ? { swimlane } : {}),
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
