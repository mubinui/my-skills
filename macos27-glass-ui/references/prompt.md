# Prompt: apply the macOS 27 Glass design to this project

Paste everything below the line into any coding agent (Claude, Cursor, Copilot, ChatGPT). If you
can, attach `assets/foundation.css` from this skill as well: it holds the exact tokens and components.

---

Redesign this project's frontend in the **macOS 27 ("Golden Gate") Liquid Glass** language. It should look
and behave like a native Mac pro app (Xcode, Instruments or System Settings on macOS 27), not like a web
dashboard or apple.com. Keep every feature, route and piece of product copy. This is a visual and layout
redesign only. If a file called `foundation.css` is attached, install it as the global stylesheet and
build on its tokens and classes.

## Window and navigation
- **Sidebar.** Flush to the window's left edge, full height, 232px wide (204px below 1280px, a 68px icon rail below 1024px, a
  drawer below 768px).
  - **Material:** Liquid Glass: `backdrop-filter: blur(50px) saturate(200%)` over a translucent grey (light
    `rgba(246,246,249,.58)`, dark `rgba(40,40,44,.56)`), with a subtle top sheen gradient.
  - **Wallpaper:** paint three low-alpha radial fields (teal `rgba(12,143,126,.20)`, violet `rgba(110,86,207,.18)`,
    pink `rgba(224,69,123,.12)`) on the app background behind the sidebar. They show only through the
    sidebar glass; the main column is opaque.
  - **Trailing edge:** a darkened 1px line with a specular line just inside it:
    `box-shadow: inset -1px 0 0 rgba(255,255,255,.96), 1px 0 0 rgba(0,0,0,.15)`.
  - **Rows:** 32px tall, 10px radius, 13px text. Each icon has its own place hue (teal, green, violet,
    magenta, cyan-teal, purple, pink, grey, graphite). The selected row is a grey pill (`rgba(0,0,0,.08)`) at
    weight 600. Group labels are 11px semibold in sentence case.
- **Toolbar.** One frosted band, 60px tall, positioned *over* the top of the content so content scrolls beneath it:
  a translucent window-colour gradient, `blur(24px) saturate(180%)`, and a 0.5px bottom hairline. Every screen pads its top by
  the toolbar height. The toolbar holds no page title.
- **Activity capsule.** The centre of the toolbar holds one 36px Liquid Glass capsule that says what's open (a borderless
  pop-up selector), what state it's in (a status glyph and 12px text), and a 2px progress hairline along its
  bottom while something runs. Clicking the status opens a log popover beneath it.
- **Toolbar buttons.** 36px Liquid Glass capsules on the right that scale to 1.03 on hover and 0.97 on press. Related actions share one
  capsule, with the prominent one as a solid graphite segment.

## Liquid Glass material
A 0.5px **darkened edge** (`0 0 0 .5px rgba(0,0,0,.15)`; dark `rgba(0,0,0,.62)`), a 1px **bright specular
rim** along the top (`inset 0 1px 0 rgba(255,255,255,.96)`; dark `.26`), a **sheen**
(`radial-gradient(160% 110% at 22% 0%, rgba(255,255,255,.55), transparent 58%)`), a translucent fill
(`rgba(255,255,255,.64)`; dark `rgba(44,44,48,.58)`), `blur(18px) saturate(190%)`, and a soft lift
(`0 6px 18px -6px rgba(0,0,0,.16)`). Use glass **only** for chrome: the sidebar, the toolbar and its capsules, menus,
popovers, toasts, and panes floating over a canvas. Content is opaque.

## Colour
- **Surfaces.** The window is `#ffffff`; dark `#1e1e1e`. Grouped boxes are `#f5f5f7`; dark `#2a2a2c`. They have no border and no shadow,
  just a step of grey. Text fields are white (dark `#323235`) with a 1px `rgba(0,0,0,.14)` stroke.
- **Text.** Ink is `#1d1d1f` (dark `#f5f5f7`). Muted text is `#515154` (dark `#c7c7cc`), dim text `#6e6e73` (dark `#98989d`).
- **Accent.** **Graphite**: the accent is the ink colour. Primary buttons are solid `#1d1d1f` with white text, and
  inverted in dark mode. Links are underlined, not coloured. Focus rings are a 3px `rgba(0,0,0,.38)` band.
- **Status.**
  - Ready is green `#248a3d` (dark `#30d158`).
  - Error is red `#d70015` (dark `#ff453a`).
  - Attention is yellow `#f2c200` (dark `#ffd60a`). On a light window yellow is only ever a glyph, a tint or a meter, never text.
- **Status shapes.** Every status has a shape as well as a hue: ready is a filled disc, attention a ring, error a diamond,
  idle a thin ring, and busy a spinning ring.
- **Forbidden.** **No blue, no orange, no brown anywhere.** That includes accents, links, selection, focus, charts, status
  and hard-coded canvas colours.

## Type and shape
- **Type.** The system stack only: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", system-ui`.
  No web fonts. Large title 28/700, title 22/700, title-2 17/600, body 13/400, callout 12, section
  label 11/600 in sentence case (never uppercase or tracked), and figures 22/600 with tabular numerals. SF Mono only
  for code and data.
- **Shape.** Buttons, badges, segmented controls, switches and toasts are capsules. Fields are 8px, rows 10px, tables
  12px, menus and cards 16px, grouped boxes 18px, floating panes 22px, and sheets 24px.
- **Controls.**
  - Push buttons are 28px capsules with a tinted fill `rgba(0,0,0,.055)`.
  - Pop-up selects show up-down chevrons.
  - Switches have a 38×20 track with a 22×16 white capsule knob; the on state is green.
  - In segmented controls, the selected segment is lit glass.
  - A highlighted menu row is solid graphite with white text.

## Screens
- **Lists.** Any "list of things with state" becomes a **macOS table plus a sticky inspector**, not a card grid:
  - Rows have a 2% zebra stripe, 11px semibold headers and right-aligned tabular numbers.
  - Arrow keys move the selection, Enter or double-click runs the row's next action.
  - Selection is a quiet grey until the table has focus, then `#6e6e73` with white text.
  - The inspector's only filled button is the selected item's next action.
- **Dashboards.** Headline numbers go in one strip of figures separated by hairlines, not same-size tiles.
- **Canvases** (node editors, graphs):
  - The canvas takes the full width. The palette and inspector float over it as glass panes (22px radius, inset 12px).
  - The inspector appears only while something is selected, and pans the selection into view at the same zoom.
  - Node cards are 220×64 with a lane-tinted icon tile, a 14px title, a 12px config line and a status glyph. They must read at about 12px at the default fit.
  - Wires are neutral grey (`#a1a1a6`) with small arrowheads. The selection's wires turn ink and the others fade.
  - Force-directed graphs use flat discs with a window-coloured rim; no 3D shading, glows or vignettes.
- **Motion.** 150ms for controls, 180–220ms with `cubic-bezier(.16,1,.3,1)` for popovers and sheets (scale in from 0.97), and
  240–260ms for floating panes sliding in from their side. Respect `prefers-reduced-motion`.
- **Themes.** Ship Light, Dark and Match system, using a `data-theme` stamp plus `prefers-color-scheme`.

## Done means
The app builds and type-checks. Screenshots in light, dark and at 390px width look like one native Mac app. Nothing
hides under the toolbar band. No blue, orange or brown colour literal remains anywhere in the source. Body text is at least 4.5:1. And a
DESIGN.md records the system and any departures from it.
