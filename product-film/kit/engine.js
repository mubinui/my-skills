/* Product-film engine: the whole film as one deterministic timeline.
 *
 * Every moving thing is an "actor": numeric keyframes per property, sampled by
 * seek(t). Nothing runs on the clock, so the renderer can step frame by frame,
 * in parallel, and every frame is exactly reproducible. Scene timing comes from
 * the measured length of each voice line (and, when align.py ran, the time of
 * every spoken word); marks on screenshots come from the element boxes the
 * capture recorded, so they sit exactly on the real interface.
 *
 * Load order: data.js (FILM), engine.js, scenes.js (calls scene(...)), then start(). */

// ------------------------------------------------------------------ config
const CFG = FILM.config;
const FPS = CFG.fps ?? 60;
const FRAME_W = 1920, FRAME_H = 1080;
const CAP_W = CFG.capture.width, CAP_H = CFG.capture.height;
// The app window the screenshots play in, centred, its top leaving room for a title.
const W = 1382, H = Math.round((W * CAP_H) / CAP_W), S0 = W / CAP_W;
const WIN_X = Math.round((FRAME_W - W) / 2), WIN_Y = FRAME_H - H - 40;
const PARAMS = new URLSearchParams(location.search);

// ------------------------------------------------------------------ timing
// S: scene start, V: voice start, E: scene end. lead/tail come from script.json.
const SC = {};
let TOTAL = 0;
for (const line of FILM.script) {
    const lead = line.lead ?? 0.7, tail = line.tail ?? 0.8;
    SC[line.id] = { ...line, S: TOTAL, V: TOTAL + lead, E: TOTAL + lead + line.dur + tail };
    TOTAL = SC[line.id].E;
}
/** Stretch the final scene so the film ends at t (e.g. on a musical bar). */
function endAt(t) {
    const last = SC[FILM.script[FILM.script.length - 1].id];
    if (t < last.V + last.dur) throw new Error(`endAt(${t}) would cut the last line off`);
    last.E = t; TOTAL = t;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
/** The aligned word spoken at character index i of a line's text, or null. */
function wordAt(s, i) {
    if (!s.words?.length) return null;
    const k = norm(s.text.slice(0, i)).length;
    const want = norm(s.text.slice(i))[0];
    // Whisper occasionally merges or splits a word; search near k for the token.
    for (const d of [0, 1, -1, 2, -2, 3, -3]) {
        const w = s.words[k + d];
        if (w && norm(w.w)[0] === want) return w;
    }
    return null;
}
/** When a phrase is spoken: exact from word timings when aligned, else estimated
 *  from the phrase's position in the text. Throws if the phrase is not in the line. */
function at(id, phrase, off = -0.1) {
    const s = SC[id];
    if (!s) throw new Error(`no scene "${id}"`);
    const i = s.text.indexOf(phrase);
    if (i < 0) throw new Error(`"${phrase}" is not in ${id}`);
    const w = wordAt(s, i);
    return s.V + (w ? w.start : s.dur * (i / s.text.length)) + off;
}
const CUES = [];
// Rings, spots and labels, to check each is inside the camera's view when it appears.
const MARKS = [];
/** A sound effect at t: kind is a key of sfx.json, gain is linear (1 = the kind's level). */
const cue = (t, kind, gain = 1) => CUES.push({ t: +t.toFixed(3), kind, gain });

// ------------------------------------------------------------------ keyframes
const EASE = {
    linear: (p) => p,
    inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    out: (p) => 1 - Math.pow(1 - p, 3),
    outQuint: (p) => 1 - Math.pow(1 - p, 5),
    in: (p) => p * p * p,
    back: (p) => { const c1 = 1.35, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    step: (p) => (p < 1 ? 0 : 1),
};
const actors = [];
const byEl = new Map();
const posts = [];
let NOW = 0;

/** Default renderer for o (opacity), x/y (px), s (scale) and blur (px). */
function applyDefault(el, v) {
    if (v.o !== undefined) {
        el.style.opacity = v.o;
        el.style.visibility = v.o <= 0.001 ? 'hidden' : 'visible';
    }
    if (v.x !== undefined || v.y !== undefined || v.s !== undefined) {
        el.style.transform = `translate(${v.x ?? 0}px, ${v.y ?? 0}px) scale(${v.s ?? 1})`;
    }
    if (v.blur !== undefined) el.style.filter = v.blur > 0.05 ? `blur(${v.blur}px)` : 'none';
}
/** Register el as an actor; apply(el, values) draws it (default: applyDefault). */
function actor(el, apply) {
    let a = byEl.get(el);
    if (!a) { a = { el, tracks: {}, apply: apply ?? applyDefault, v: {} }; byEl.set(el, a); actors.push(a); }
    else if (apply) a.apply = apply;
    return a;
}
/** Keyframe: at time t, these props reach these values, eased from the previous key. */
function kf(el, t, props, ease = 'inOut') {
    const a = actor(el);
    for (const [k, v] of Object.entries(props)) (a.tracks[k] ??= []).push({ t, v, e: ease });
}
function sample(track, t) {
    const n = track.length;
    if (t <= track[0].t) return track[0].v;
    if (t >= track[n - 1].t) return track[n - 1].v;
    let i = 0;
    while (track[i + 1].t <= t) i += 1;
    const A = track[i], B = track[i + 1];
    if (B.t === A.t) return B.v;
    return A.v + (B.v - A.v) * EASE[B.e]((t - A.t) / (B.t - A.t));
}
function seek(t) {
    NOW = t;
    for (const a of actors) {
        for (const k in a.tracks) a.v[k] = sample(a.tracks[k], t);
        a.apply(a.el, a.v);
    }
    for (const post of posts) post(t);
}

// ------------------------------------------------------------------ DOM helpers
const $ = (id) => document.getElementById(id);
function mk(tag, cls, parent, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    parent.appendChild(el);
    return el;
}
function svgEl(tag, attrs, parent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
}
function place(el, x, y, w, h) {
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    if (w !== undefined) el.style.width = `${w}px`;
    if (h !== undefined) el.style.height = `${h}px`;
}
/** Fade and slide an element in at t0 and out at t1 (null: stays). */
function show(el, t0, t1, o = {}) {
    const { inD = 0.5, outD = 0.4, dx = 0, dy = 14, ds = 1, ease = 'outQuint', blur = 0 } = o;
    const start = { o: 0, x: dx, y: dy, s: ds };
    const end = { o: 1, x: 0, y: 0, s: 1 };
    if (blur) { start.blur = blur; end.blur = 0; }
    kf(el, 0, start);
    kf(el, t0, start);
    kf(el, t0 + inD, end, ease);
    if (t1 != null) {
        kf(el, t1 - outD, { o: 1 });
        kf(el, t1, { o: 0 }, 'inOut');
    }
}
// Lucide icons (ISC licence), stroke paths only.
const ICON = {
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    sparkles: '<path d="M9.94 14.06 4 20"/><path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
    workflow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
};
const icon = (name, size, color, width = 1.8) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

// ------------------------------------------------------------------ stage, window and camera
const stage = $('stage'), titles = $('titles'), fx = $('fx'), fade = $('fade'), grid = $('grid'), bgDark = $('bg-dark');
const win = $('win'), cam = $('cam'), shots = $('shots'), ann = $('ann'), wires = $('wires');
place(win, WIN_X, WIN_Y, W, H);
for (const el of [cam, shots, ann, wires]) { el.style.width = `${CAP_W}px`; el.style.height = `${CAP_H}px`; }
wires.setAttribute('viewBox', `0 0 ${CAP_W} ${CAP_H}`);

let camState = { x: 0, y: 0, s: S0 };
actor(cam, (el, v) => { el.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`; });
kf(cam, 0, camState);
function camAt(fx_, fy, z) {
    const s = S0 * z;
    const x = Math.min(0, Math.max(W - CAP_W * s, W / 2 - fx_ * s));
    const y = Math.min(0, Math.max(H - CAP_H * s, H / 2 - fy * s));
    return { x, y, s };
}
/** Move the camera to look at (fx, fy), in screenshot CSS pixels, at zoom z (1 = whole screen). */
function camTo(t0, t1, fx_, fy, z, ease = 'inOut') {
    kf(cam, t0, camState);
    camState = camAt(fx_, fy, z);
    kf(cam, t1, camState, ease);
}
/** Bring the app window in (or out): opacity, rise and a slight scale. */
function windowIn(t, d = 0.9) { kf(win, 0, { o: 0, y: 70, s: 0.95 }); kf(win, t, { o: 0, y: 70, s: 0.95 }); kf(win, t + d, { o: 1, y: 0, s: 1 }, 'outQuint'); }
function windowOut(t, d = 0.6) { kf(win, t - d, { o: 1, y: 0, s: 1 }); kf(win, t, { o: 0, y: 30, s: 0.97 }, 'inOut'); }

/** Cross-fade a captured screen in at t. Later shots stack over earlier ones. */
function shot(name, t, fade_ = 0.45, sfx = true) {
    if (!FILM.boxes[name]) throw new Error(`no capture "${name}" (shots/${name}.png + boxes.json)`);
    const img = mk('img', 'shot', shots);
    img.src = `shots/${name}.png`;
    kf(img, 0, { o: 0 });
    kf(img, t, { o: 0 });
    kf(img, t + fade_, { o: 1 }, 'inOut');
    if (sfx) cue(t - 0.05, 'whoosh');
    return img;
}
/** The recorded box of a named element on a captured screen. */
const box = (name, key) => {
    const b = FILM.boxes[name]?.[key];
    if (!b) throw new Error(`no box ${name}.${key}: add it to that shot's targets in capture.mjs`);
    return b;
};
const geom = (b, pad = 6, r = 12) => ({ l: b.x - pad, t: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2, r });

/** A rectangle that appears, glides between boxes, and leaves: cls 'ring' or 'spot'. */
function mover(cls, steps, tOut, { glide = 0.55, pop = true } = {}) {
    const el = mk('div', cls, ann);
    actor(el, (e, v) => {
        e.style.left = `${v.l}px`; e.style.top = `${v.t}px`; e.style.width = `${v.w}px`; e.style.height = `${v.h}px`;
        e.style.borderRadius = `${v.r}px`; e.style.opacity = v.o; e.style.visibility = v.o <= 0.001 ? 'hidden' : 'visible';
        e.style.transform = `scale(${v.s})`;
    });
    const first = steps[0];
    kf(el, 0, { o: 0, s: 1, ...first.g });
    kf(el, first.t - 0.001, { o: 0, s: pop ? 1.12 : 1, ...first.g });
    kf(el, first.t + 0.35, { o: 1, s: 1 }, pop ? 'back' : 'out');
    for (let i = 1; i < steps.length; i += 1) {
        kf(el, steps[i].t - glide, steps[i - 1].g);
        kf(el, steps[i].t, steps[i].g, 'inOut');
    }
    kf(el, tOut - 0.35, { o: 1 });
    kf(el, tOut, { o: 0 }, 'inOut');
    if (cls === 'ring') steps.forEach((s) => cue(s.t, 'tick'));
    steps.forEach((st) => MARKS.push({ what: `${cls} at ${st.t.toFixed(2)}s`, t: st.t + 0.35, r: { x: st.g.l, y: st.g.t, w: st.g.w, h: st.g.h } }));
    return el;
}
const ring = (b, t0, t1, pad = 6, r = 12) => mover('ring', [{ t: t0, g: geom(b, pad, r) }], t1);
const spot = (b, t0, t1, pad = 10, r = 16) => mover('spot', [{ t: t0, g: geom(b, pad, r) }], t1, { pop: false });

/** A pill with a leader line and a dot on the point (ax, ay) it names. side: r l u d. */
function label(text, ax, ay, t0, t1, { side = 'r', len = 26, size = 14 } = {}) {
    const g = mk('div', 'lbl', ann);
    place(g, ax, ay);
    mk('div', 'dot', g);
    const lead = mk('div', 'lead', g);
    const pill = mk('div', 'pill', g, text);
    pill.style.fontSize = `${size}px`;
    pill.style.padding = `${Math.round(size * 0.42)}px ${Math.round(size * 0.85)}px`;
    const pw = pill.offsetWidth, ph = pill.offsetHeight, lw = Math.max(1.5, size / 8);
    if (side === 'r') { place(lead, 0, -lw / 2, len, lw); place(pill, len, -ph / 2); }
    if (side === 'l') { place(lead, -len, -lw / 2, len, lw); place(pill, -len - pw, -ph / 2); }
    if (side === 'u') { place(lead, -lw / 2, -len, lw, len); place(pill, -pw / 2, -len - ph); }
    if (side === 'd') { place(lead, -lw / 2, 0, lw, len); place(pill, -pw / 2, len); }
    const slide = { r: [-8, 0], l: [8, 0], u: [0, 8], d: [0, -8] }[side];
    show(g, t0, t1, { dx: slide[0], dy: slide[1], inD: 0.45 });
    const px = pill.offsetLeft, py = pill.offsetTop;
    const x0 = Math.min(0, px), y0 = Math.min(0, py), x1 = Math.max(0, px + pw), y1 = Math.max(0, py + ph);
    MARKS.push({ what: `label "${text}"`, t: t0 + 0.45, r: { x: ax + x0, y: ay + y0, w: x1 - x0, h: y1 - y0 } });
    return g;
}

/** Draw an SVG path on from t0 over dur. */
function paint(path, t0, dur, ease = 'inOut') {
    path.setAttribute('pathLength', '1');
    path.setAttribute('stroke-dasharray', '1 1');
    actor(path, (e, v) => { e.style.strokeDashoffset = 1 - v.p; e.style.opacity = v.o; });
    kf(path, 0, { p: 0, o: 0 });
    kf(path, t0 - 0.01, { p: 0, o: 0 });
    kf(path, t0, { o: 1 }, 'linear');
    kf(path, t0 + dur, { p: 1 }, ease);
}
/** A bright streak travelling along path d: something flowing down a wire. */
function comet(d, t0, dur, { color = '#1d1d1f', width = 4, len = 0.22, parent = wires } = {}) {
    const glow = svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': width * 3.2, 'stroke-linecap': 'round', opacity: 0.16, pathLength: 1, 'stroke-dasharray': `${len} 3` }, parent);
    const core = svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': `${len} 3` }, parent);
    for (const p of [glow, core]) {
        const base = p === glow ? 0.16 : 1;
        actor(p, (e, v) => { e.style.strokeDashoffset = v.q; e.style.opacity = v.o * base; });
        kf(p, 0, { q: len, o: 0 });
        kf(p, t0, { q: len, o: 0 });
        kf(p, t0 + 0.12, { o: 1 }, 'linear');
        kf(p, t0 + dur - 0.12, { o: 1 });
        kf(p, t0 + dur, { q: -1, o: 0 }, 'inOut');
    }
}
/** A React Flow-style bezier between two points, so drawn wires match real ones. */
function bezier(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const off = dx >= 0 ? 0.5 * dx : 0.25 * 25 * Math.sqrt(-dx);
    return `M${x1},${y1} C${x1 + off},${y1} ${x2 - off},${y2} ${x2},${y2}`;
}

// The pointer, appended last in build() so it sits over every mark.
const pointer = mk('div', 'cursor', ann,
    '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 24 L7.6 18.8 L11.4 27.6 L15.4 25.8 L11.6 17.2 L19 17.2 Z" fill="#1d1d1f" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>');
let pointerAt = { x: CAP_W / 2, y: CAP_H / 2 };
kf(pointer, 0, { o: 0, x: pointerAt.x, y: pointerAt.y, s: 1 });
function pointerShow(t, x, y) { kf(pointer, t - 0.001, { o: 0, x, y }); kf(pointer, t + 0.3, { o: 1 }, 'out'); pointerAt = { x, y }; }
function pointerMove(t0, t1, x, y) { kf(pointer, t0, { x: pointerAt.x, y: pointerAt.y }); kf(pointer, t1, { x, y }, 'inOut'); pointerAt = { x, y }; }
function pointerHide(t) { kf(pointer, t - 0.3, { o: 1 }); kf(pointer, t, { o: 0 }); }
function pointerClick(t) {
    kf(pointer, t - 0.08, { s: 1 }); kf(pointer, t, { s: 0.84 }, 'out'); kf(pointer, t + 0.16, { s: 1 }, 'out');
    const r = mk('div', 'ripple', ann);
    place(r, pointerAt.x + 2, pointerAt.y + 2);
    kf(r, 0, { o: 0, s: 0.3 }); kf(r, t - 0.001, { o: 0, s: 0.3 }); kf(r, t + 0.02, { o: 0.9 }, 'linear'); kf(r, t + 0.6, { o: 0, s: 1.5 }, 'out');
    cue(t, 'click');
}
/** Move to a recorded box's centre (plus dx, dy) and click it at t. */
function clickOn(b, t0, t, dx = 0, dy = 0) { pointerMove(t0, t - 0.1, b.x + b.w / 2 + dx, b.y + b.h / 2 + dy); pointerClick(t); }

/** A chapter title above the window, aligned to its left edge. */
function title(id, kicker, head, { dark = false, t0, t1 } = {}) {
    const s = SC[id];
    const el = mk('div', `title${dark ? ' on-dark' : ''}`, titles, `<div class="kicker">${kicker}</div><div class="head">${head}</div>`);
    el.style.left = `${WIN_X}px`;
    el.style.top = `${Math.max(36, WIN_Y - 118)}px`;
    show(el, t0 ?? s.S + 0.25, t1 ?? s.E + 0.2, { dy: 14, inD: 0.6, outD: 0.35 });
    return el;
}

/** A ring that swells from a point and fades: the visual beat of a musical hit. */
function pulse(parent, cx, cy, size, t, { color = 'rgba(29,29,31,.22)', grow = 2.2, dur = 1.0 } = {}) {
    const r = mk('div', '', parent);
    r.style.cssText = `position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;border-radius:${size * 0.3}px;border:2px solid ${color}`;
    kf(r, 0, { o: 0, s: 0.8 }); kf(r, t - 0.001, { o: 0, s: 0.8 }); kf(r, t + 0.05, { o: 1 }, 'linear'); kf(r, t + dur, { o: 0, s: grow }, 'out');
}
/** A word set large, each letter rising out of its own mask. */
function wordmark(parent, text, size, t0, stagger = 0.045) {
    const wm = mk('div', 'wm', parent, [...text].map((ch) => `<span>${ch === ' ' ? '&nbsp;' : ch}</span>`).join(''));
    wm.style.fontSize = `${size}px`;
    [...wm.children].forEach((sp, i) => {
        kf(sp, 0, { o: 0, y: size * 1.1 });
        kf(sp, t0 + i * stagger, { o: 0, y: size * 1.1 });
        kf(sp, t0 + i * stagger + 0.75, { o: 1, y: 0 }, 'outQuint');
    });
    return wm;
}
/** Grow the dot grid out from the centre of the frame. */
actor(grid, (e, v) => {
    e.style.opacity = v.o; e.style.visibility = v.o <= 0.001 ? 'hidden' : 'visible';
    const m = `radial-gradient(circle at 50% 46%, #000 ${v.r * 0.35}px, transparent ${v.r}px)`;
    e.style.webkitMaskImage = m; e.style.maskImage = m;
});
kf(grid, 0, { o: 0, r: 0 });
function gridIn(t0, t1) { kf(grid, t0, { o: 1, r: 0 }); kf(grid, t1, { r: 1500 }, 'out'); }
/** Cross to the night background and back. */
function night(t0, t1, d = 0.8) { kf(bgDark, 0, { o: 0 }); kf(bgDark, t0, { o: 0 }); kf(bgDark, t0 + d, { o: 1 }); if (t1 != null) { kf(bgDark, t1 - d, { o: 1 }); kf(bgDark, t1, { o: 0 }); } }
kf(bgDark, 0, { o: 0 });
kf(win, 0, { o: 0, y: 70, s: 0.95 });

// Slow drift of the background washes: motion even when nothing else moves.
const washes = [...document.querySelectorAll('.wash')];
posts.push((t) => washes.forEach((w, i) => {
    const k = i % 2 ? -1 : 1;
    w.style.transform = `translate(${Math.sin(t * 0.07 + i) * 90 * k}px, ${Math.cos(t * 0.05 + i * 2) * 60}px)`;
}));

// ------------------------------------------------------------------ captions
/** Caption chunks: at most ~42 characters, broken after punctuation where possible. */
function captionChunks() {
    const out = [];
    for (const s of Object.values(SC)) {
        // Each word's start and end, aligned when possible, else spread by characters.
        const words = [], times = [];
        for (const m of s.text.matchAll(/\S+/g)) {
            const w = wordAt(s, m.index);
            const est = [s.dur * (m.index / s.text.length), s.dur * ((m.index + m[0].length) / s.text.length)];
            words.push(m[0]); times.push(w ? [w.start, w.end] : est);
        }
        let cur = [], len = 0, start = 0;
        words.forEach((w, i) => {
            if (!cur.length) start = times[i][0];
            cur.push(w); len += w.length + 1;
            const last = i === words.length - 1;
            const brk = /[.,;:!?]$/.test(w) && len > 18;
            if (last || brk || len + (words[i + 1]?.length ?? 0) > 42) {
                out.push({ t0: s.V + start, t1: s.V + times[i][1] + 0.15, text: cur.join(' ') });
                cur = []; len = 0;
            }
        });
    }
    for (let i = 0; i + 1 < out.length; i += 1) out[i].t1 = Math.min(out[i].t1, out[i + 1].t0);
    return out.map((c) => ({ ...c, t0: +c.t0.toFixed(3), t1: +c.t1.toFixed(3) }));
}
function burnCaptions(chunks) {
    const el = mk('div', 'caption', stage);
    let shown = -1;
    posts.push((t) => {
        const i = chunks.findIndex((c) => t >= c.t0 && t < c.t1);
        if (i !== shown) { el.textContent = i < 0 ? '' : chunks[i].text; el.style.visibility = i < 0 ? 'hidden' : 'visible'; shown = i; }
    });
}

/** Marks the camera does not fully show at the moment they appear: a missed beat. */
function offCamera() {
    const c = byEl.get(cam).tracks, out = [];
    for (const m of MARKS) {
        const x = sample(c.x, m.t), y = sample(c.y, m.t), s = sample(c.s, m.t);
        const v = { x: -x / s, y: -y / s, w: W / s, h: H / s };
        const r = m.r, tol = 4;
        if (r.x < v.x - tol || r.y < v.y - tol || r.x + r.w > v.x + v.w + tol || r.y + r.h > v.y + v.h + tol) {
            out.push(`${m.what}: outside the camera (shows x ${Math.round(v.x)}-${Math.round(v.x + v.w)}, y ${Math.round(v.y)}-${Math.round(v.y + v.h)}; mark x ${Math.round(r.x)}-${Math.round(r.x + r.w)}, y ${Math.round(r.y)}-${Math.round(r.y + r.h)})`);
        }
    }
    return out;
}

// ------------------------------------------------------------------ scenes and build
const SCENES = {};
/** Register the scene for script line id. fn(s) gets { id, text, dur, S, V, E, words }. */
function scene(id, fn) { SCENES[id] = fn; }
let MUSIC = CFG.music ?? null;
/** Override the music plan from scenes.js, e.g. to time a drop to the logo. See mix.py. */
function music(plan) { MUSIC = plan; }

async function start() {
    try {
        await document.fonts.ready;
        const missing = FILM.script.map((l) => l.id).filter((id) => !SCENES[id]);
        if (missing.length) throw new Error(`no scene() for: ${missing.join(', ')}`);
        for (const line of FILM.script) SCENES[line.id](SC[line.id]);
        ann.appendChild(pointer);
        // Whole-film fade from and to white.
        kf(fade, 0, { o: 1 }); kf(fade, 0.7, { o: 0 }, 'inOut');
        kf(fade, TOTAL - 1.3, { o: 0 }); kf(fade, TOTAL, { o: 1 }, 'inOut');
        for (const a of actors) for (const k in a.tracks) a.tracks[k].sort((p, q) => p.t - q.t);
        const captions = captionChunks();
        if (PARAMS.has('captions')) burnCaptions(captions);
        await Promise.all([...document.images].map((img) => (img.complete ? img.decode().catch(() => {}) : new Promise((r) => { img.onload = img.onerror = r; }))));
        const broken = [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src'));
        if (broken.length) throw new Error(`images failed to load: ${broken.join(', ')}`);
        seek(0);
        window.FILM_INFO = {
            fps: FPS, total: TOTAL, frames: Math.round(TOTAL * FPS),
            cues: CUES.sort((p, q) => p.t - q.t),
            voice: Object.values(SC).map((s) => ({ id: s.id, t: s.V })),
            scenes: Object.values(SC).map((s) => ({ id: s.id, S: s.S, V: s.V, E: s.E })),
            captions, music: MUSIC, warnings: offCamera(),
        };
        window.seek = seek;
        window.ready = true;
    } catch (e) {
        window.buildError = String(e.stack || e);
        console.error(window.buildError);
    }
}
