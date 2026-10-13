/**
 * Renders film.html frame by frame. Frames are pure functions of time, so the
 * film is split across workers (one headless Chromium each) and the chunks are
 * joined without re-encoding.
 *
 *   node render.mjs info                      # timing, cues, captions -> info.json
 *   node render.mjs stills 3.2 10 45.5        # PNGs of single moments -> stills/
 *   node render.mjs video                     # -> out/picture.mp4 (the master)
 *     --scale 2        device pixels per CSS px: 2 = 3840×2160, 1 = 1920×1080
 *     --workers 4      parallel Chromiums (default: half the cores, max 6)
 *     --from 10 --to 25   render a slice (seconds) to out/slice.mp4 for review
 *     --captions       burn captions in (for feeds that autoplay muted)
 *
 * Colour: Chromium's frames are sRGB; they are converted to BT.709 limited-range
 * YUV with an explicit matrix and tagged as such (setparams: x264's own -color_*
 * options are overridden by the PNG frames' metadata). Untagged, players guess,
 * and brand colours shift.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'info';
// Positional args are those that are neither a --flag nor a flag's value.
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--captions'].includes(argv[i - 1])));
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const CFG = JSON.parse(readFileSync(new URL('./film.config.json', import.meta.url), 'utf8'));
const R = CFG.render ?? {};
const SCALE = Number(flag('scale', R.scale ?? 2));
const CAPTIONS = Boolean(flag('captions', false));
const url = new URL('./film.html', import.meta.url).href + (CAPTIONS ? '?captions=1' : '');

async function open() {
    const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.ready || window.buildError, null, { timeout: 120000 });
    const err = await page.evaluate(() => window.buildError);
    if (err) { console.error(err); process.exit(1); }
    return { browser, page };
}

/** One frame as PNG. A screenshot now and then stalls in headless Chromium: seek again and retry. */
async function frame(page, t) {
    for (let attempt = 0; ; attempt += 1) {
        await page.evaluate((tt) => window.seek(tt), t);
        const png = await page.screenshot({ type: 'png', timeout: 15000 }).catch((e) => {
            if (attempt >= 4) throw e;
            console.log(`t=${t.toFixed(3)}: retrying (${e.message.split('\n')[0]})`);
            return null;
        });
        if (png) return png;
    }
}

function encoder(out, fps) {
    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
        '-c:v', 'libx264', '-preset', R.preset ?? 'slow', '-crf', String(R.crf ?? 14), '-profile:v', 'high',
        '-g', String(fps * 2), '-bf', '3', '-x264-params', 'aq-mode=3',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-movflags', '+faststart', out];
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((resolve, reject) => ff.on('close', (c) => (c ? reject(new Error(`ffmpeg exited ${c} for ${out}`)) : resolve())));
    return { write: (buf) => (ff.stdin.write(buf) ? null : new Promise((r) => ff.stdin.once('drain', r))), end: () => { ff.stdin.end(); return done; } };
}

const { browser, page } = await open();
const info = await page.evaluate(() => window.FILM_INFO);
writeFileSync('info.json', JSON.stringify(info, null, 1));
console.log(`total ${info.total.toFixed(2)}s at ${info.fps} fps = ${info.frames} frames, ${info.cues.length} cues, ${info.captions.length} captions`);
for (const w of info.warnings) console.log(`WARNING ${w}`);

if (mode === 'stills') {
    mkdirSync('stills', { recursive: true });
    for (const t of positional.slice(1).map(Number)) {
        writeFileSync(`stills/t${t.toFixed(2).padStart(7, '0')}.png`, await frame(page, t));
        console.log('still', t);
    }
}
await browser.close();

if (mode === 'video') {
    const fps = info.fps;
    const from = Number(flag('from', 0)), to = Math.min(Number(flag('to', info.total)), info.total);
    const first = Math.round(from * fps), last = Math.round(to * fps);
    const slice = from > 0 || to < info.total;
    const out = slice ? 'out/slice.mp4' : 'out/picture.mp4';
    const workers = Math.max(1, Math.min(Number(flag('workers', Math.min(6, Math.floor(cpus().length / 2)))), Math.ceil((last - first) / (fps * 2))));
    rmSync('out/chunks', { recursive: true, force: true });
    mkdirSync('out/chunks', { recursive: true });
    const per = Math.ceil((last - first) / workers);
    const started = Date.now();
    let doneFrames = 0;
    const tick = setInterval(() => {
        const s = (Date.now() - started) / 1000, n = doneFrames;
        if (n) console.log(`${n}/${last - first} frames, ${(n / s).toFixed(1)} fps, ~${Math.round(((last - first - n) * s) / n)}s left`);
    }, 15000);
    const chunks = Array.from({ length: workers }, (_, w) => [first + w * per, Math.min(last, first + (w + 1) * per)]).filter(([a, b]) => b > a);
    await Promise.all(chunks.map(async ([a, b], w) => {
        const { browser: br, page: pg } = await open();
        const enc = encoder(`out/chunks/${String(w).padStart(3, '0')}.mp4`, fps);
        for (let f = a; f < b; f += 1) {
            await enc.write(await frame(pg, f / fps));
            doneFrames += 1;
        }
        await enc.end();
        await br.close();
    }));
    clearInterval(tick);
    writeFileSync('out/chunks/list.txt', chunks.map((_, w) => `file '${String(w).padStart(3, '0')}.mp4'`).join('\n') + '\n');
    await new Promise((resolve, reject) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'out/chunks/list.txt', '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' })
        .on('close', (c) => (c ? reject(new Error('concat failed')) : resolve())));
    console.log(`${out}: ${last - first} frames in ${((Date.now() - started) / 1000).toFixed(0)}s with ${chunks.length} workers`);
}
