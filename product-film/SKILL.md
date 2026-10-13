---
name: product-film
description: Use when asked to make a product video, demo video, product film, launch video, walkthrough or tour video, explainer, or LinkedIn/YouTube video of a web app: narrated, with zooms, highlights, a cursor, sound effects and music. Also use to re-cut, re-voice, re-time or improve the quality of such a video ("make it sharper", "4K", "60fps", "the callouts are late", "the colours look off").
---

# Product film

Makes a narrated product video of a web app from real screenshots, composed as one
deterministic HTML timeline and rendered frame by frame. It is not a screen
recording. Every frame is a pure function of time, so the film renders at any
resolution and frame rate, in parallel, the same every time. Marks sit on the real UI
because the capture records element boxes. Beats land on the spoken word because the
timeline is built from the measured narration.

**Never use Playwright `recordVideo` or a screen recorder for the picture.** It records
VP8 at about 1 Mb/s, in real time, with dropped frames, so it can't zoom sharply or be
re-timed.

## The kit

Copy `kit/` into the project as `film/`, then link Playwright into it:
`ln -s ../<app>/node_modules film/node_modules` (or `npm i -D playwright`). Needs
ffmpeg, Python 3 with numpy, and one TTS key (`OPENROUTER_API_KEY` by default).
Keep `film/` out of the product repo's git unless asked: it's a production folder.

| Step | Command | Writes |
|---|---|---|
| 1. Script | edit `script.json`: one `{id, text, lead, tail}` per beat | |
| 2. Capture | `node capture.mjs` (edit its "screens" section) | `shots/*.png`, `shots/boxes.json` |
| 3. Voice | `python3 voice.py && python3 trim.py && python3 align.py` | `voice/trim/*.wav`, `voice/words/*.json` |
| 4. Data | `python3 build_data.py` | `data.js` |
| 5. Choreograph | edit `scenes.js`: one `scene(id, fn)` per line | |
| 6. Review | `node render.mjs info`, then `node render.mjs stills <t...> --scale 1` and **look at them** | `info.json`, `stills/` |
| 7. Render | `node render.mjs video` (4K60, all cores) | `out/picture.mp4` |
| 8. Sound + deliver | `node render.mjs info && python3 mix.py && python3 finish.py` | `out/<name>-2160p.mp4`, `-1080p.mp4`, `.srt`, `contact.jpg` |

`make capture | voice | data | review | render | film` runs the same steps. After a
change, re-run from the step that reads it. Edited `scenes.js`? Run 4 and 6. Changed a
line's text? Run `voice.py <id>`, `trim.py <id>` and `align.py <id>`, then 4.

Engine API, scene recipes and pacing rules: **read `reference/choreography.md` before
writing `scenes.js`.**

## Quality bar (defaults in the kit; keep them)

| Area | Setting | Why |
|---|---|---|
| Capture | `scale: 3` (device px per CSS px) | Keeps a 2× camera zoom sharp in a 4K frame. Capture at 2 and zooms go soft. |
| Picture | 3840×2160 (`--scale 2`), 60 fps | Supersampled text, smooth pans. Deliver 1080p as a Lanczos downscale of the 4K master, never a 1080p render. |
| Encode | x264 `slow`, CRF 14, `aq-mode=3`, BT.709 matrix + `setparams` tags | Without tags, players guess BT.601 and brand colours shift. `finish.py` fails if tags are missing. |
| Voice | Accept a take only on a transcript match ≥ 0.97 and 1.6–3.6 words/s; trim, high-pass, level each line to -18 LUFS | TTS drops words and drags. Unlevelled lines jump. |
| Timing | `at(id, phrase)` on aligned word times, never hard-coded seconds | Callouts land on the word, and re-voicing doesn't break them. |
| Sound | Music ducked 9 dB under the voice; two-pass loudnorm to -14 LUFS, -1.5 dBTP; AAC 320k (AudioToolbox) | What YouTube and LinkedIn normalise to. Effects stay under the voice. |
| Captions | `.srt` always; `--captions` burns them in | LinkedIn and X autoplay muted. |

## Before you call it done

- `render.mjs info` prints `WARNING ... outside the camera` for every ring, spot or
  label the camera isn't showing when it appears. Fix every one: move the camera or
  the mark.
- Look at a still a second into every line (`make review`), and at `out/contact.jpg`.
  Check that crop edges don't cut through text, that no label covers what it names,
  and that nothing is left on screen from the previous scene.
- `finish.py` must print `checks passed`: colour tagged, -14 LUFS ±1, and sound and
  picture the same length.
- Render a slice before the full film: `node render.mjs video --from 40 --to 55`
  writes `out/slice.mp4`.

## Common mistakes

- Seconds hard-coded inside a line (`s.V + 3.2`). Use `at(id, 'phrase')`.
- A `box()` target captured in a different state than the one shown. Capture after the
  UI settles, and record boxes on the same screenshot the scene shows.
- One long scene per feature. Keep a beat to one idea, 5–15 s of narration.
- Zooming past 2× or holding a zoom through a cut. Return to `z = 1` before a `shot()`
  that changes the screen.
- Too many effects. A tick on each ring, a whoosh on each screen change, a click on each
  click, nothing else.
- Music that isn't licensed for the use. Mixkit, Pixabay and Artlist are fine; note the
  licence in `scenes.js`.

The original Delaxis film shows a full 3-minute example of this choreography (a logo
morph, live-run comets, a bar-aligned music ending). On this machine it's at
`~/Home/PycharmProjects/MicrosoftAutogen/film/film.js`, if that folder still exists.
