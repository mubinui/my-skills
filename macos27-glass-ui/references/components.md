# Component patterns

Markup for each piece of the system, written as JSX because the reference build was React. The
class names match `assets/foundation.css`. Plain HTML, Vue and Svelte use the same markup;
only the event wiring changes.

## Contents
1. App shell: sidebar, toolbar band, activity capsule
2. Toolbar capsules and groups
3. Status: glyphs, badges, the "yellow is never text" rule
4. Controls: buttons, fields, pop-up, switch, segmented
5. Table + inspector (the "Finder list view" home screen)
6. Grouped boxes, figures, summary strip
7. Menus, popovers, sheets, toasts
8. Canvas (React Flow): stage cards, lane bands, wires, floating panes, pan-to-reveal
9. Canvas 2D graph (force layout) painting rules
10. Theme switching

---

## 1. App shell

```jsx
<div className="app">
  <nav className="app-nav" aria-label="Main">
    <button className="app-nav-brand"><Logo /> <span className="brand-word">Product</span></button>
    <div className="nav-group-label">Workspace</div>
    <button className="nav-item" style={{ "--hue": "var(--hue-1)" }} aria-current="page">
      <Icon name="grid" size={16} /><span className="nav-text">Home</span>
    </button>
    <button className="nav-item" style={{ "--hue": "var(--hue-2)" }}>…</button>
    <div className="nav-group-label">This project<span className="nav-scope truncate">Acme</span></div>
    …
  </nav>

  <div className="app-main">
    <header className="app-header">                 {/* absolute, frosted, content scrolls under */}
      <div className="header-lead">
        <button className="btn btn-ghost btn-icon menu-button" aria-label="Open navigation">☰</button>
      </div>
      <div className="activity liquid">…</div>       {/* see below */}
      <div className="header-actions">…capsules…</div>
    </header>
    <main className="app-content" tabIndex={-1}>
      <div className="page"><div className="page-inner">
        <h1 className="display">Large title</h1>
        <p className="lead">One sentence on what this screen is for.</p>
        …
      </div></div>
    </main>
  </div>
</div>
```

The rules that matter here:
- **`.page` pads its top by `--toolbar-h` + 20px.** The toolbar band is `position: absolute` over the content, so every screen has to start beneath it. A full-bleed screen that is not a `.page`, such as a canvas or a split view, gets `padding-top: var(--toolbar-h)` from the `.app-content > :not(.page)` rule.
- **The toolbar never names the page.** The large title and the selected sidebar row do that.
- **The wallpaper fields are painted on `.app`, and `.app-main` is opaque.** That way they only show through the sidebar glass.
- **Responsive steps:** 232px sidebar, then 204px below 1280px, then a 68px icon rail below 1024px, then a drawer below 768px. On phones the `nav-drawer` is a `<dialog>` holding the same `NavItems`.

### Activity capsule (the signature)
One capsule in the centre of the toolbar answers three questions: what is open, what state it is in, and what is running.
```jsx
<div className="activity liquid">
  <select className="select activity-select" aria-label="Project">…</select>
  {dirty && <span className="activity-edited" title="Unsaved changes">Edited</span>}
  <span className="activity-sep" aria-hidden />
  <button className="activity-status" onClick={toggleLog} aria-expanded={logOpen}>
    <span className="status-glyph" data-shape={running ? "busy" : ok ? "ok" : "bad"} aria-hidden />
    <span>{running ? `${phase} · ${pct}%` : ok ? "Build succeeded" : "Build failed"}</span>
  </button>
  {running && <span className="activity-progress" style={{ transform: `scaleX(${pct / 100})` }} />}
</div>
```
Adapt the content to the product. A deploy tool might show the environment, deploy state and rollout percentage; a notes app might show the notebook, sync state and upload progress. When there's nothing running, the status half shows a steady state, such as "Index current".

## 2. Toolbar capsules and groups
```jsx
<button className="btn btn-toolbar"><Icon name="play" size={12} /> Build</button>
<button className="btn btn-toolbar btn-icon" aria-label="More">⋯</button>

{/* related actions share ONE glass capsule; the prominent one is the graphite segment */}
<div className="toolbar-group liquid" role="group" aria-label="Document actions">
  <button className="btn" disabled={!dirty}><Icon name="save" /> Save</button>
  <button className="btn btn-primary"><Icon name="play" /> Build</button>
</div>
```

## 3. Status
```jsx
<span className="status-glyph" data-shape="ok" />    {/* filled green disc */}
<span className="status-glyph" data-shape="warn" />  {/* yellow ring */}
<span className="status-glyph" data-shape="bad" />   {/* red diamond */}
<span className="status-glyph" data-shape="idle" />  {/* thin dim ring */}
<span className="status-glyph" data-shape="busy" />  {/* spinning yellow arc */}

<span className="chip chip-ok"><span className="dot" />Ready</span>
<span className="chip chip-warn"><span className="dot" />Rebuild needed</span>  {/* ink text in light mode */}
<span className="chip chip-bad"><span className="dot" />Needs fixes</span>
```
In light mode, never write text in `var(--amber)`. Use `var(--amber-text)`, which resolves to ink on light and to yellow on dark. `--amber` is only for fills, rings and meters.

## 4. Controls
- **Buttons.** Buttons are capsules: `.btn` for a tinted fill, `.btn-primary` for solid graphite (one per view), `.btn-ghost`, `.btn-danger`, `.btn-sm` and `.btn-icon`.
- **Fields.** Use `.input`, `.textarea` and `.select`. A `.select` is a pop-up button with ⌃⌄ chevrons drawn from `--chevrons`. Wrap each field with a label, hint and error, tied together by ids.
- **Switch.** The switch is a `button role="switch"`:
  ```jsx
  <button role="switch" aria-checked={on} className="switch" onClick={…}>
    <span className="switch-track" data-on={on ? "" : undefined}><span className="switch-thumb" /></span>
    <span className="switch-text">{on ? "On" : "Off"}</span>
  </button>
  ```
- **Segmented control.** It's a `role="radiogroup"` `.segmented` holding `role="radio"` buttons. Arrow keys move the selection.

## 5. Table + inspector
This is the default for any "list of things with state" screen. Don't use a grid of cards.
```jsx
<div className="split-layout">
  <div className="mac-table-box">
    <table className="mac-table">
      <thead><tr><th>Name</th><th>Status</th><th className="num col-optional">Items</th></tr></thead>
      <tbody onKeyDown={arrowUpDownMovesSelection}>
        {rows.map(r => (
          <tr aria-selected={r.id === selected} onClick={() => select(r.id)} onDoubleClick={r.primaryAction}>
            <td style={{ maxWidth: 0, width: "46%" }}>
              <button className="row-title" onFocus={() => select(r.id)}>{r.name}</button>
              <span className="row-sub">{r.description}</span>
            </td>
            <td><span className="row-status"><span className="status-glyph" data-shape={r.shape} />{r.statusLabel}</span></td>
            <td className="num col-optional">{r.count.toLocaleString()}</td>
          </tr>))}
      </tbody>
    </table>
  </div>
  <aside className="inspector">
    <h2 className="h2">{sel.name}</h2>
    <span className="inspector-status"><span className="status-glyph" data-shape={sel.shape} />{sel.statusLabel}</span>
    <p>{sel.explanation}</p>
    <button className="btn btn-primary">{sel.nextAction}</button>   {/* the ONLY filled button */}
    <div className="figures">…</div>
    <div className="inspector-rows">…</div>
  </aside>
</div>
```
Selection stays a quiet grey until the table has focus, then turns graphite grey with white text. The CSS handles this with `:focus-within`.

## 6. Grouped boxes and figures
- **Grouped box.** Use `.panel` (`--glass`, 18px radius, no border, no shadow). Rows nested inside it use `--glass-raised`.
- **Figures.** Show headline numbers as a `.figures` strip of `.figure` items (a 22px number with an 11px caption), divided by hairlines. Don't use six same-size tiles.
- **Summary strip.** `.panel.figures.summary-strip` puts a dashboard's headline numbers on one strip.

## 7. Menus, popovers, sheets, toasts
- **Menus.** Menus are `.menu-popover.glass-strong`. A highlighted `.menu-item` is solid graphite with inverse text, as on a Mac.
- **Popovers and sheets.** `.dialog` is a native `<dialog>` with focus on the safest choice. Both scale in from 0.97; they never slide.
- **Toasts.** Toasts are glass capsules centred at the bottom.

## 8. Canvas (React Flow)
- **Full width.** The canvas takes the full width. The palette and inspector are floating glass panes (`.studio-palette`, `.studio-inspector`). The inspector is rendered only while a node is selected, and it has a close button.
- **Framing.** Frame the graph with per-side pixel padding, so the floating chrome never covers nodes:
  ```ts
  type Px = `${number}px`;
  const fit = { minZoom: 0.28, maxZoom: 1, duration: 240,
    padding: { top: "64px" as Px, bottom: "56px" as Px, right: "36px" as Px,
               left: (paletteOpen ? "288px" : "36px") as Px } };
  ```
- **Pan to reveal.** When the selected node would sit under the inspector, pan at the same zoom rather than re-fitting:
  ```ts
  useEffect(() => {
    if (!current || narrow) return;
    const vp = getViewport();
    const right = (current.position.x + CARD_W) * vp.zoom + vp.x;
    const limit = wrapper.current!.clientWidth - 372;      // inspector width + inset + gutter
    if (right > limit) setViewport({ ...vp, x: vp.x - (right - limit) }, { duration: 260 });
  }, [current?.id]);
  ```
- **Node card.** Render each node as a `.stage-card`: a 32px lane-tinted icon tile (set `--lane` on the card), a 14px semibold title, a 12px dim config line, and a status glyph. At 220px wide it stays legible at about 0.85 zoom.
- **Lane bands.** Draw lane bands as non-interactive nodes behind the cards, sized to each group's bounding box:
  `{ id, type: "lane", zIndex: -1, draggable: false, selectable: false, deletable: false, data: { label, width, height } }`.
- **Wires.** Use `type: "smoothstep"`, `pathOptions: { borderRadius: 16 }`, and `markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color }`. Marker colours must be literal values: read them with `getComputedStyle`, and re-read them when the theme changes. Add the class `is-reference` for dashed wires, `is-active` for wires touching the selection, and `is-muted` for the rest.
- **Floating chrome.** Put the index figures in a `.canvas-stats.liquid` capsule top-right, and the legend in `.canvas-legend.liquid` bottom-right. Zoom controls get the glass capsule styling automatically. Drop the minimap.
- **Narrow screens (< 1024px).** Default to a list view. Choosing an item replaces the list with an opaque full-width inspector that has a "Back" button.

## 9. Canvas 2D graph (force layout)
- **Nodes.** Draw nodes as flat discs in their categorical colour, with a 1.5–2px ring in the window colour. Don't shade them as spheres or add glows or a vignette.
- **Secondary node kind.** Draw it as an outlined rounded square (30% corner radius) with a 22% fill.
- **Links.** Links within one group are `--wire` grey at about 0.4 alpha. Only links that cross groups carry colour, a blend of the two groups' colours, dashed if they are inferred.
- **Selection.** A selected node gets a 2px ink ring, its links draw in ink at 60% and 1.3px, and everything else fades to about 13%.
- **Labels.** Labels are 11.5px semibold on glass pills and are drawn most-important-first. Skip any label that would overlap one already drawn.
- **Controls.** Controls go in one `.toolbar-group.liquid` capsule; the legend and detail panel are glass panes.

## 10. Theme switching
Stamp `data-theme="light" | "dark"` on `<html>`, or remove it to follow the system. Both dark blocks in the foundation are deliberate duplicates, because CSS can't apply one named palette in two places. Offer Light, Dark and Match system in a menu. Canvas code has to re-read CSS variables when the theme changes.
