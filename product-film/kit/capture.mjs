/**
 * Captures the screens the film is built from, and on each one the box of every
 * element the film points at, so rings, labels and clicks land on the real UI.
 *
 *   node capture.mjs                 # every screen
 *   ONLY=board,card-open node capture.mjs   # just these; the other boxes are kept
 *
 * Screens are taken at config.capture.width × height CSS px and `scale` device
 * pixels per CSS px (3 keeps a 2× camera zoom sharp in a 4K render). Boxes are
 * in CSS px. Edit the "screens" section below for your product.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CFG = JSON.parse(readFileSync(new URL('./film.config.json', import.meta.url), 'utf8')).capture;
const BASE = process.env.CAPTURE_URL ?? CFG.url;
const OUT = new URL('./shots/', import.meta.url).pathname;
const ONLY = process.env.ONLY?.split(',');
mkdirSync(OUT, { recursive: true });
const boxes = {};

const browser = await chromium.launch();

/** A fresh browser context: fixed viewport, theme and any first-run state preset. */
async function session({ theme = 'light', storage = {} } = {}) {
    const ctx = await browser.newContext({
        viewport: { width: CFG.width, height: CFG.height }, deviceScaleFactor: CFG.scale,
        colorScheme: theme, reducedMotion: 'reduce',
    });
    await ctx.addInitScript((items) => { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, storage);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle').catch(() => {});
    return { ctx, page };
}

/** Screenshot the page as `name`, and record the box of each target selector (first match). */
async function shot(page, name, targets = {}) {
    if (ONLY && !ONLY.includes(name)) return;
    // Hide what should never be in a film frame: carets, scrollbars, dev overlays, the real cursor.
    await page.addStyleTag({ content: '*{caret-color:transparent!important;scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}' });
    await page.mouse.move(CFG.width - 1, CFG.height - 1);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(450);   // let hover states and transitions settle
    await page.screenshot({ path: `${OUT}${name}.png` });
    const found = {};
    for (const [key, selector] of Object.entries(targets)) {
        const b = await page.locator(selector).first().boundingBox({ timeout: 3000 }).catch(() => null);
        if (b) found[key] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        else console.warn(`  ${name}: no element for ${key} (${selector})`);
    }
    boxes[name] = found;
    console.log('captured', name, `${Object.keys(found).length}/${Object.keys(targets).length} boxes`);
}

/** Retry an action until a condition holds: for menus and lists that load late. */
async function until(page, act, ready, attempts = 5) {
    for (let i = 0; i < attempts; i += 1) {
        await act();
        if (await ready().then(() => true, () => false)) return;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1200);
    }
    throw new Error('never became ready');
}

// ================================================================== screens
// One shot() per screen the film shows. Name the targets after what the
// narration talks about; scenes.js reads them as box('screen', 'target').
{
    const { ctx, page } = await session({ theme: 'light' });

    await shot(page, 'board', { columns: '.columns', card: '.card >> nth=1', sidebar: 'nav' });

    await page.locator('.card').nth(1).click();
    await page.waitForTimeout(600);
    await shot(page, 'card-open', { pane: 'aside.detail', title: 'aside.detail h2' });

    await ctx.close();
}
// ================================================================== end screens

await browser.close();
// Merge, so a partial run (ONLY=...) keeps the boxes of the screens it skipped.
const previous = existsSync(`${OUT}boxes.json`) ? JSON.parse(readFileSync(`${OUT}boxes.json`, 'utf8')) : {};
writeFileSync(`${OUT}boxes.json`, JSON.stringify({ ...previous, ...boxes }, null, 2));
console.log('wrote boxes.json:', Object.keys({ ...previous, ...boxes }).join(', '));
