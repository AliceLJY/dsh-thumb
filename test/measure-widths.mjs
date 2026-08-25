/**
 * Reproduces the width table in the README.
 *
 * Not an assertion — it prints numbers. The suite (test/smoke.mjs) asserts the
 * two ends of the range; this is what you run when you want to see the whole
 * curve, or to re-derive the table after an upstream layout change.
 *
 * Run:  node test/measure-widths.mjs
 * Env:  same as test/smoke.mjs (DSH_URL, PW_ROOT, CHROME_PATH)
 *
 * What it measures, and why that particular quantity:
 *
 *   The first attempt at this compared how much of the transcript the drawer
 *   covers while it is open. By that measure stock wins at every width, which
 *   is plainly wrong — 113px of reflowed text on a phone is the thing this
 *   plugin exists to fix. The mistake was measuring an instant rather than a
 *   destination.
 *
 *   Stock's problem is not occlusion. It is that opening the sidebar reflows
 *   the transcript to width-280 and *leaves it there* after you tap a session,
 *   because nothing closes the sidebar for you. So the quantity that makes the
 *   two comparable is the transcript width once you have arrived: width-280
 *   for stock, width-56 for the shell.
 */
import { createRequire } from 'node:module';

const PW_ROOT = process.env.PW_ROOT || '/opt/homebrew/lib/node_modules/playwright';
const CHROME = process.env.CHROME_PATH || '/Applications/Chromium.app/Contents/MacOS/Chromium';
const URL_BASE = process.env.DSH_URL || 'http://127.0.0.1:3080/';
const WIDTHS = [393, 480, 560, 604, 640, 700, 768, 900, 1023];

const { chromium } = createRequire(import.meta.url)(PW_ROOT);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });

/** Walk the path a user has to take to switch sessions, then measure. */
async function transcriptWidthAfterOpeningASession(width, { stock }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL_BASE + (stock ? '?thumb=0' : ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const toggle = await page.$('[class*="_toggle"]');
  if (toggle) { await toggle.click().catch(() => {}); await page.waitForTimeout(1200); }
  for (const row of await page.$$('[class*="_sessionRow"]')) {
    const t = (await row.textContent() || '').trim();
    if (t && t !== '新会话' && t !== 'New session') { await row.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(3000);
  const w = await page.evaluate(() => {
    const c = document.querySelector('[class*="centerCol"]');
    return c ? Math.round(c.getBoundingClientRect().width) : null;
  });
  await ctx.close();
  return w;
}

console.log('| viewport | stock | with the shell | gain |');
console.log('|---:|---:|---:|---:|');
for (const width of WIDTHS) {
  const stock = await transcriptWidthAfterOpeningASession(width, { stock: true });
  const shell = await transcriptWidthAfterOpeningASession(width, { stock: false });
  const gain = stock && shell ? Math.round((shell - stock) / stock * 100) : null;
  console.log(`| ${width}px | ${stock}px | ${shell}px | +${gain}% |`);
}
await browser.close();
