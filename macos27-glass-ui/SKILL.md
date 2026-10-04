---
name: macos27-glass-ui
description: Redesign or build a web app UI in the macOS 27 "Golden Gate" Liquid Glass language, as shipped in Weft (context-graph-service v0.4.0). It covers a flush glass sidebar with a coloured icon per place over a soft wallpaper tint, a frosted toolbar band that content scrolls beneath, a centred activity capsule, and grouped Liquid Glass toolbar buttons. The accent is Graphite, status is shown by shape as well as colour, yellow means attention and is never text in light mode, and there is no blue, orange or brown. It uses the system SF font stack, a macOS table with an inspector instead of card grids, and floating glass panes over full-width canvases. Use this skill whenever the user asks for an Apple-, Mac-, macOS-, Liquid Glass-, Tahoe-, "27"- or Weft-style design, wants another project to look like Weft or context-graph-service, or asks to reuse or port "that design" to a React, Vue, Svelte, Next.js or plain HTML frontend. Use it even for "make it look like my other app" or "apply the same design here".
---

# macOS 27 Glass UI

This skill applies a proven, user-approved design system to a web frontend. The system was built for Weft,
a RAG studio. It went through a redesign, a finish review and two rounds of feedback from the
owner, who called it "amazing design". Your job is to carry the same world into a different
product: keep the material, the rules and the feel, and swap in that product's own screens,
places and states.

## What's in this skill

| File | Use it for |
|---|---|
| `assets/foundation.css` | The drop-in foundation: tokens (light, dark, and system-following), materials, type, controls, shell, table + inspector, floating panes and canvas styling. Start here. |
| `references/components.md` | Markup and code for every piece: the shell, the activity capsule, toolbar groups, status, controls, table + inspector, menus, React Flow canvas behaviour, and 2D graph painting. Read the sections you need. |
| `references/weft-DESIGN.md` | The complete spec from the original build: every token, measurement, shadow, named rule, do and don't. Treat it as the worked example and the source of truth when in doubt. |
| `references/weft-design.json` | The same system as machine-readable tokens and component specs. |
| `references/prompt.md` | A self-contained prompt with the whole direction, for a tool or agent that can't load this skill. |
| `scripts/check_palette.py` | Scans a codebase for blue, orange or brown colour literals. Run it before you finish. |

## The world, in one paragraph

The app window is the frame. A Liquid Glass sidebar runs flush to the leading edge, full height, and a
soft teal, violet and pink wallpaper shows only through it. A frosted toolbar band lies over the top of the
content, and content scrolls beneath it. In its centre sits one glass capsule, the activity view,
which says what's open, what state it's in and what's running. Toolbar actions are Liquid Glass
capsules, and related ones share a single capsule. Content is opaque: white, or #1E1E1E in dark mode. Grouped boxes are a step of grey with
no border and no shadow. The accent is Graphite, so the primary button is the darkest thing on a light window
and the lightest on a dark one. Colour is kept for status, and every status also has a shape.

## Rules, and why they exist

The owner explicitly asked for, rejected or corrected each of these. Keep them unless the new
project's owner says otherwise.

1. **No blue, orange or brown, anywhere.** The owner rejected a blue theme and "brown/orange" during the
   original build. That covers accents, links, selection, focus rings, charts, status and hard-coded canvas
   colours. Run `scripts/check_palette.py`, because hard-coded colours in JS slip past the tokens.
2. **The accent is Graphite.** Accent colour: #1d1d1f on light, #f5f5f7 on dark. Because the accent reads as text,
   links are told apart by an underline, not a hue. Use one solid primary button per view, for that view's next action.
3. **Status has a shape.** Ready is a green disc, attention a yellow ring, error a red diamond, idle a thin ring, and busy a
   spinning ring. This keeps status readable in greyscale and for colour-blind users. Never use a bare coloured dot.
4. **Yellow is never text on a light window.** Yellow is only a glyph, a badge tint or a meter. `--amber-text`
   is ink on light and yellow on dark.
5. **Glass is chrome.** Only the sidebar, the toolbar band and its capsules, menus, popovers, toasts, and panes
   floating over a canvas are translucent. Glass is only convincing where there's something to float over. Everywhere else it's decoration, and it makes content harder to read.
6. **It's macOS 27, not older macOS.** The owner said the first pass had an "old macOS vibe". What fixed it:
   - A flush sidebar, not an inset floating one.
   - A frosted toolbar band with content scrolling beneath, not an opaque bar.
   - Liquid Glass drawn with a 0.5px darkened edge, a 1px bright specular rim and a top-left sheen.
   - Coloured sidebar icons, one hue per place.
   - Rounder shapes: 8px fields, 16–18px boxes, 22–24px panes, capsule buttons.
7. **Use the system font stack only.** No web fonts, since SF is the typeface and it works offline. Use a 13px body, 28px bold large titles and 11px
   semibold section labels in sentence case, never tracked capitals. SF Mono is only for machine data.
8. **Tables, not card walls.** Any "list of things with state" screen is a macOS table plus a sticky inspector,
   where the selected item's next action is the only filled button. Headline numbers go in one strip of figures,
   not six same-size tiles.
9. **Canvases get the full width.** Their palette, inspector and controls float over them as glass. The inspector
   appears only while something is selected, and pans the selection into view at the same zoom rather than re-zooming.
   Node text has to be readable (about 12px or more) at the default fit.
10. **Wires are neutral grey.** Colour on a link means the link crosses groups. The selected item's links turn ink,
    and the rest fade back.

## Workflow

1. **Read the target project.** Work out the framework, the styling approach (Tailwind, CSS modules, plain CSS,
   CSS-in-JS), how it handles theming, its screens and navigation, its primary object (the thing an activity
   capsule should report on), its statuses, and any canvas or graph views. Take screenshots of the current UI if it runs.
2. **Map the concepts.** Write a short mapping before touching code. For example:
   - *Places*: each sidebar destination gets its own hue from the no-blue/orange/brown family (`--hue-1..9`).
   - *Primary object*: what the activity capsule shows. In Weft that was the graph, its index state and build progress.
   - *Statuses*: map each one to ok, warn, bad, idle or busy.
   - *List screens*: these become table + inspector.
   - *Canvases*: these follow the canvas rules.

   If `/impeccable` or another design skill is present, treat this system as a pinned brief. Its rules
   override that skill's defaults.
3. **Install the foundation.** Copy `assets/foundation.css` into the project's global stylesheet after any
   reset or Tailwind preflight. With Tailwind v4, put it after `@import "tailwindcss";`. With CSS-in-JS, import it as a global
   stylesheet anyway; the custom properties are the contract. Remove any web-font `<link>`s. Add
   `<meta name="color-scheme" content="light dark">`.
4. **Rebuild the shell** following `references/components.md` §1–2: the flush glass sidebar with place hues, the
   frosted toolbar band laid over the content, the activity capsule, the toolbar capsules, and top padding on
   every screen so nothing hides under the band. Add a theme menu with Light, Dark and Match system.
5. **Restyle the components**: buttons, fields, pop-up chevrons, switches, segmented controls, badges, status glyphs,
   menus and dialogs. Replace ad-hoc inline colours with tokens.
6. **Recompose the screens**: turn card walls into table + inspector, dashboards into summary strips, and canvases
   into full-width layouts with floating panes. Keep every function, route and piece of copy that states a product fact. This is a
   visual redesign, not a feature change.
7. **Verify, in one batched round:**
   - Build and type-check.
   - Screenshot the key screens in light and dark at 1440×900, and at 390px width. Headless Chrome won't
     go narrower than about 500px, so render phone width inside a 390px iframe or through DevTools device emulation.
   - Run `python3 <skill>/scripts/check_palette.py <frontend src>` and fix every hit.
   - Check contrast: body text at least 4.5:1, and yellow never used as text on light.
   - Fix everything you find in one batch, then do at most one more round.
8. **Document it.** Write a DESIGN.md for the new project, modelled on `references/weft-DESIGN.md`, recording any
   departures and why.

## Things that went wrong the first time

- A toolbar with no background and an inset sidebar read as "old macOS". Go straight to the 27 treatment.
- Hard-coded canvas colours (a sky blue and an amber) survived a clean CSS pass. Grep for them.
- A docked palette and inspector squeezed a React Flow canvas to about 0.45× zoom, which left node titles around 5px. Float them instead.
- A fully graphite table selection was the heaviest thing on the screen. Selection is grey until the table has focus.
- A page title in the toolbar duplicated the large title. The toolbar never names the page.
- Several parallel headless captures against a backend with one shared SQLite connection caused a spurious 500. Capture one at a time when the backend is fragile.
