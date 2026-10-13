# Choreography: writing scenes.js

## Timeline model

- `script.json` drives the timing. Line *i* occupies `[S, E]`. Its voice starts at
  `V = S + lead`, and `E = V + dur + tail`, where `dur` is the measured length of the
  trimmed take. Scenes follow each other with no gaps; overlap them by keyframing into
  the next scene's time.
- `scene(id, fn)` registers `fn(s)`, where `s = {id, text, dur, S, V, E, words}`.
  Scenes run in script order, once, at build time. They create DOM and keyframes and
  never touch the clock.
- `kf(el, t, {prop: value}, ease)` sets a keyframe. Each property is eased from its
  previous key. Before the first key the property holds that key's value, and after the
  last key it holds the last one. The default props are `o` (opacity), `x`, `y`, `s`
  (scale) and `blur`. For custom props, register `actor(el, (el, v) => ...)` to draw
  them.
- Eases: `inOut` (camera, cross-fades), `outQuint` (things arriving), `back` (pops),
  `out`, `in`, `linear` (typing, progress), `step`.
- `posts.push((t) => ...)` runs a function each frame for continuous motion (drift,
  dash offsets). It must be a pure function of `t`.
- `at(id, 'phrase', off = -0.1)` returns when the phrase's first word is spoken. It
  uses aligned word times when available, otherwise an estimate. It throws if the
  phrase isn't in the line, so editing the text breaks the build loudly, not silently.
  Start a mark 0.1–0.3 s before the word it illustrates.
- `cue(t, kind, gain)` places a sound effect from `sfx.json` (`whoosh tick click pop
  glass confirm scroll key`). `shot()`, `ring`/`mover('ring')` and `pointerClick()`
  already cue their own sounds.
- `endAt(t)` stretches the last scene, for example to land the end on a musical bar.
  `music({...})` overrides the music plan (see the `mix.py` docstring).

## Building blocks (engine.js)

| Call | Does |
|---|---|
| `windowIn(t)`, `windowOut(t)` | The app window rises in or drops out. |
| `shot(name, t, fade = .45, sfx = true)` | Cross-fades screen `shots/<name>.png` in. Later shots stack over earlier ones. Use `fade .2–.3`, `sfx false` for a cut on a click. |
| `box(name, key)` | `{x, y, w, h}` of a captured element, in screenshot CSS px. |
| `geom(b, pad, r)` | A box padded into a ring or spot geometry. |
| `camTo(t0, t1, fx, fy, z)` | Camera looks at `(fx, fy)` (screenshot px) at zoom `z`, clamped to the screen. |
| `ring(b, t0, t1, pad, r)`, `spot(b, t0, t1)` | Outline a box, or dim everything except it. |
| `mover('ring' or 'spot', [{t, g}], tOut, {glide})` | One mark gliding between boxes as each is named. Better than a new ring per item. |
| `label(text, ax, ay, t0, t1, {side: 'r' or 'l' or 'u' or 'd', size})` | A pill with a leader line to the point. |
| `pointerShow / pointerMove / pointerClick / pointerHide`, `clickOn(b, t0, t)` | A synthetic cursor with a click ripple. |
| `title(id, kicker, head)` | A chapter title above the window, for the scene's span. |
| `paint(path, t0, dur)`, `comet(d, t0, dur)`, `bezier(x1, y1, x2, y2)` | Draw an SVG wire on, or send a streak along one (`wires` is the SVG over the screenshot). |
| `show(el, t0, t1, {dx, dy, ds, blur, inD, outD})` | Fade and slide any element in, and out. |
| `wordmark(parent, text, size, t0)`, `pulse(...)`, `gridIn(t0, t1)`, `night(t0, t1)` | Title cards: letters rising, a beat ring, the dot grid, the dark background. |
| `mk(tag, cls, parent, html)`, `place(el, x, y, w, h)`, `svgEl`, `icon(name, size, color)` | Make DOM. Use `fx` for full-frame layers (1920×1080) and `ann` for marks on the screenshot. |

## Scene recipe (a product chapter)

```js
scene('inspector', (s) => {
    title('inspector', 'Inspector', 'Configure any agent in place.');
    shot('studio', s.S, 0.3);                       // the screen before the click
    camTo(s.S, s.S + 0.8, 720, 450, 1.0);
    const agent = box('studio', 'agent');
    pointerShow(s.S + 0.25, 760, 220);
    clickOn(agent, s.S + 0.3, s.S + 1.05);          // the click...
    shot('studio-inspector', s.S + 1.15, 0.25, false); // ...cuts to the result
    pointerHide(s.S + 1.9);
    camTo(s.S + 1.6, s.S + 2.7, 1185, 300, 1.55);   // push in on what the line is about
    const end = s.E + 0.05;
    mover('ring', [                                  // one ring, gliding word by word
        { t: at('inspector', 'Model,', -0.15), g: geom(box('studio-inspector', 'tabModel'), 4, 9) },
        { t: at('inspector', 'tools,', -0.15), g: geom(box('studio-inspector', 'tabTools'), 4, 9) },
    ], end, { glide: 0.35 });
});
```

## Pacing and craft

- One idea per line. Open each chapter with a title, a screen and the camera settling
  (`lead` 0.7–1.2 s). Let the last mark breathe before the cut (`tail` 0.7–1.0 s). The
  opening card takes `lead` ~3–4 s. The end card takes `tail` ~4–5 s for the music to
  resolve.
- The camera moves at most twice per line, over 0.8–1.5 s, with `inOut`. A wide shot
  orients the viewer, then push in on what's being named. Zoom 1.1–1.6; 2.0 only for
  tiny UI such as ports or badges.
- Frame zooms so the crop edge falls in empty space or at a panel edge, never through
  a word.
- Marks are ink, never a brand colour, so they read as annotation, not as UI. One active
  mark at a time. Glide it instead of stacking.
- Every mark appears on, or just before, the word that names it, and leaves when the
  line ends.
- Show the result of an action in a capture of the real result (`flow-done`,
  `test-chat` with a real reply), never a mocked one.
- Pure-animation chapters (an idea, an architecture, a logo) go on the `fx` layer over
  the paper or `night()` background, with the window hidden.
- The opening and closing cards: let the wordmark rise letter by letter, land it on a
  `glass` cue or a musical hit, and finish on the URL or command while the music
  resolves.

## Capture tips (capture.mjs)

- Preset every first-run flag (tours, cookie banners, "what's new") in `session({storage})`.
  Hide demo-only chrome with `addStyleTag`.
- Use real data in a realistic state: a populated workflow, a real model reply. Wait
  on the condition (`waitForFunction`), not on a timeout, for anything that streams.
- Name the boxes after the narration's nouns. Add every box a scene might point at. A
  missing box fails the build with its name.
- `ONLY=a,b node capture.mjs` re-captures single screens and keeps every other screen's
  boxes.
- Rate-limited APIs: split light and dark passes, and pause between them.
