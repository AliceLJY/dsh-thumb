/**
 * dsh-thumb smoke suite.
 *
 * Drives a real dsh web instance and asserts the phone shell does what the
 * README claims — layout at the phone viewport, no effect on desktop, and the
 * off switch actually switching it off. Every number here was measured, not
 * assumed; see README "Verification".
 *
 * Run:  node test/smoke.mjs
 * Env:  DSH_URL      (default http://127.0.0.1:3080/)
 *       PW_ROOT      (default /opt/homebrew/lib/node_modules/playwright)
 *       CHROME_PATH  (default /Applications/Chromium.app/Contents/MacOS/Chromium)
 *
 * Three traps this file exists to encode, each of which cost a debugging round:
 *   1. ESM ignores NODE_PATH, so a globally installed playwright needs an
 *      absolute specifier — and it is CommonJS, so take the default export.
 *   2. Chromium picks up the system proxy and ts.net addresses time out. Use
 *      the loopback URL with --no-proxy-server.
 *   3. waitUntil:'networkidle' never fires — dsh holds a connection open — so
 *      use domcontentloaded plus a fixed settle.
 */
import { createRequire } from 'node:module';

const PW_ROOT = process.env.PW_ROOT || '/opt/homebrew/lib/node_modules/playwright';
const CHROME = process.env.CHROME_PATH || '/Applications/Chromium.app/Contents/MacOS/Chromium';
const URL_BASE = process.env.DSH_URL || 'http://127.0.0.1:3080/';
const SETTLE = 7000;

const require_ = createRequire(import.meta.url);
const { chromium } = require_(PW_ROOT);

const PHONE = { width: 393, height: 660 };
const DESKTOP = { width: 1440, height: 900 };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
};

async function openSession(page, { thumbOff = false, expandFirst = true } = {}) {
  await page.goto(URL_BASE + (thumbOff ? '?thumb=0' : ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE);
  // The sidebar auto-collapses below 1024px, so the phone runs have to expand
  // it to reach the session list. On desktop it is already open and clicking
  // the toggle would close it — which is why this is a parameter.
  if (expandFirst) {
    const toggle = await page.$('[class*="_toggle"]');
    if (toggle) { await toggle.click(); await page.waitForTimeout(1500); }
  }
  let opened = false;
  for (const row of await page.$$('[class*="_sessionRow"]')) {
    const t = (await row.textContent() || '').trim();
    if (t && t !== '新会话' && t !== 'New session') { await row.click(); opened = true; break; }
  }
  await page.waitForTimeout(5000);
  return opened;
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });

// ---------------------------------------------------------------- locators
{
  console.log('\nlocators (phone viewport)');
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE);
  const stamped = await page.evaluate(() =>
    [...document.querySelectorAll('[data-thumb]')].map(e => e.getAttribute('data-thumb')));
  for (const name of ['frame', 'sidebar', 'center', 'details']) {
    ok('stamps ' + name, stamped.includes(name), 'stamped: ' + JSON.stringify(stamped));
  }
  ok('injects its stylesheet', await page.evaluate(() => !!document.getElementById('dsh-thumb-css')));
  await ctx.close();
}

// ------------------------------------------------------------------ drawer
{
  console.log('\ndrawer (phone viewport)');
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE);
  const toggle = await page.$('[class*="_toggle"]');
  if (toggle) { await toggle.click(); await page.waitForTimeout(1200); }
  const m = await page.evaluate(() => {
    const g = s => getComputedStyle(document.querySelector('[data-thumb="' + s + '"]'));
    const frame = g('frame'), side = g('sidebar'), center = g('center');
    return {
      cols: frame.gridTemplateColumns,
      sidePos: side.position,
      centerCol: center.gridColumn,
      centerW: Math.round(document.querySelector('[data-thumb="center"]').getBoundingClientRect().width),
      scrim: !!document.querySelector('.dsh-thumb-scrim'),
    };
  });
  // The whole point: the chat keeps the full frame width instead of the 113px
  // the upstream column solver leaves it at 393px.
  ok('chat keeps full width behind the drawer', m.centerW >= 380, 'centerW=' + m.centerW);
  ok('sidebar floats over the chat', m.sidePos === 'fixed', m.sidePos);
  ok('center stays pinned to track 2', m.centerCol.startsWith('2'), m.centerCol);
  ok('scrim is present while open', m.scrim);
  await ctx.close();
}

// ----------------------------------------------------------------- density
{
  console.log('\nreading density (phone viewport)');
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  const opened = await openSession(page);
  if (!opened) {
    console.log('  skip  no existing session to read — density not asserted');
  } else {
    const m = await page.evaluate(() => {
      const cs = (sel, p) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[p] : null; };
      const col = document.querySelector('[class*="_column"]');
      return {
        font: cs('[data-thumb="center"] [class*="_markdown"]', 'fontSize'),
        lh: cs('[data-thumb="center"] [class*="_markdown"]', 'lineHeight'),
        bubblePad: cs('[data-thumb="center"] [class*="_bubble"]', 'padding'),
        colGap: col ? getComputedStyle(col).gap : null,
        scroll: col ? col.scrollHeight : null,
      };
    });
    ok('body text is 14px', m.font === '14px', m.font);
    ok('body leading is 21px', m.lh === '21px', m.lh);
    ok('bubble padding tightened', m.bubblePad === '7px 12px', m.bubblePad);
    ok('turn gap tightened to 10px', m.colGap === '10px', m.colGap);

    // End-to-end: the same transcript with the shell off must be taller.
    const off = await browser.newContext({ viewport: PHONE });
    const offPage = await off.newPage();
    await openSession(offPage, { thumbOff: true });
    const stock = await offPage.evaluate(() => {
      const col = document.querySelector('[class*="_column"]');
      return col ? col.scrollHeight : null;
    });
    const saved = stock && m.scroll ? (stock - m.scroll) / stock : 0;
    ok('transcript is at least 15% shorter than stock',
       saved >= 0.15, 'stock=' + stock + ' thumb=' + m.scroll + ' saved=' + (saved * 100).toFixed(1) + '%');
    await off.close();
  }
  await ctx.close();
}

// ------------------------------------------------------- density stays put
{
  console.log('\ndensity does not reach the trace view');
  // The trace view mounts in the same center pane as the transcript, and its
  // toolbar is made of text buttons. An early cut of the density rules sized
  // every button under [class*="_actions"] to 24px square and collapsed those
  // into an unreadable overlap -- reported from a phone, invisible to a suite
  // that only ever looked at the conversation tab. Hence this block.
  //
  // The tab control does not take a click at phone width under Playwright, so
  // open it at desktop size and then shrink the viewport: same mounted view,
  // narrow layout, no navigation in between.
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE);
  for (const row of await page.$$('[class*="_sessionRow"]')) {
    const t = (await row.textContent() || '').trim();
    if (t && t !== '新会话' && t !== 'New session') { await row.click(); break; }
  }
  await page.waitForTimeout(4500);
  let onTrace = false;
  try { await page.locator('text=轨迹').first().click({ timeout: 8000 }); onTrace = true; }
  catch { try { await page.locator('text=Trace').first().click({ timeout: 4000 }); onTrace = true; } catch {} }
  if (!onTrace) {
    console.log('  skip  could not open the trace tab — containment not asserted');
  } else {
    await page.waitForTimeout(2500);
    await page.setViewportSize(PHONE);
    await page.waitForTimeout(2500);
    const outside = await page.evaluate(() => {
      const flow = document.querySelector('[data-thumb="center"] [class*="_column"]:has([class*="_flowItem"])');
      return [...document.querySelectorAll('[data-thumb="center"] button')]
        .filter(b => !flow || !flow.contains(b))
        .filter(b => (b.textContent || '').trim().length >= 4)
        .map(b => ({ text: (b.textContent || '').trim().slice(0, 14), w: Math.round(b.getBoundingClientRect().width) }));
    });
    // A text button squeezed to icon size is the signature of the regression.
    // Zero-width entries are buttons the trace view keeps mounted but hidden
    // (a collapsed menu); they are not rendered at all, so there is no width
    // for a rule to have taken away.
    const visible = outside.filter(b => b.w > 0);
    const squeezed = visible.filter(b => b.w <= 28);
    ok('text buttons outside the transcript keep their width',
       visible.length > 0 && squeezed.length === 0,
       'visible=' + visible.length + ' squeezed=' + JSON.stringify(squeezed));
  }
  await ctx.close();
}

// ------------------------------------------------------------- off switch
{
  console.log('\noff switch (?thumb=0, phone viewport)');
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.goto(URL_BASE + '?thumb=0', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE);
  const m = await page.evaluate(() => ({
    style: !!document.getElementById('dsh-thumb-css'),
    stamps: document.querySelectorAll('[data-thumb]').length,
  }));
  ok('no stylesheet injected', !m.style);
  ok('nothing stamped', m.stamps === 0, 'stamps=' + m.stamps);
  await ctx.close();
}

// --------------------------------------------------------- desktop regress
{
  console.log('\ndesktop regression (1440x900)');
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const opened = await openSession(page, { expandFirst: false });
  const m = await page.evaluate(() => {
    const side = document.querySelector('[data-thumb="sidebar"]');
    const md = document.querySelector('[data-thumb="center"] [class*="_markdown"]');
    return {
      sidePos: side ? getComputedStyle(side).position : null,
      sideW: side ? Math.round(side.getBoundingClientRect().width) : null,
      font: md ? getComputedStyle(md).fontSize : null,
    };
  });
  ok('sidebar stays in flow on desktop', m.sidePos !== 'fixed', String(m.sidePos));
  if (opened && m.font) ok('desktop text left at 16px', m.font === '16px', m.font);
  else console.log('  skip  no session open — desktop text size not asserted');
  await ctx.close();
}

await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
