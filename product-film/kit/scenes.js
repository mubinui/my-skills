/* The film's choreography: one scene() per line of script.json, in its order.
 * Each gets s = { id, text, dur, S (scene start), V (voice start), E (scene end) }.
 * Time every beat to the narration with at(id, phrase): never hard-code seconds
 * inside a line, or re-voicing it will slide every mark off its word.
 * Engine API: see the skill's reference/choreography.md. */

// ------------------------------------------------------------------ open: title card
scene('open', (s) => {
    const g = mk('div', 'layer', fx);
    gridIn(0.1, 2.4);
    const wm = wordmark(g, 'Acme', 140, 0.6);
    place(wm, 960 - wm.offsetWidth / 2, 380);
    pulse(g, 960, 458, 260, 0.75, { grow: 2.4, dur: 1.3 });
    cue(0.55, 'glass');
    const tag = mk('div', 'tagline', g, 'Plan, build, and ship, in one place.');
    tag.style.top = '560px';
    show(tag, at('open', 'One place', -0.2), null, { dy: 16, inD: 0.8 });
    // A slow push while the line is read, then away into the product.
    kf(g, 1.2, { s: 1, o: 1, blur: 0 });
    kf(g, s.E - 0.7, { s: 1.025, o: 1, blur: 0 }, 'linear');
    kf(g, s.E + 0.15, { o: 0, s: 1.06, blur: 8 }, 'inOut');
});

// ------------------------------------------------------------------ board: the product
scene('board', (s) => {
    windowIn(s.S - 0.2);
    shot('board', s.S, 0.5);
    title('board', 'Boards', 'Every project, at a glance.');
    // The whole board stays in view while the spotlight names it; the push-in comes after the click.
    camTo(s.S, s.S + 0.1, 720, 450, 1.0);
    const end = s.E + 0.05;

    // Name the columns as they are mentioned.
    const tBoard = at('board', 'on a board', -0.2);
    spot(box('board', 'columns'), tBoard, at('board', 'Click a card', -0.3), 12, 18);

    // The pointer opens a card; the next capture cross-fades in on the click.
    const card = box('board', 'card');
    const tClick = at('board', 'to open it', 0);
    pointerShow(tBoard + 0.4, 900, 700);
    clickOn(card, tBoard + 0.5, tClick);
    shot('card-open', tClick + 0.08, 0.25, false);
    pointerMove(tClick + 0.3, tClick + 0.9, 1300, 820);
    pointerHide(tClick + 1.0);

    // Push in on the top of the detail pane, where its content is; ring it and name it.
    const pane = box('card-open', 'pane'), head = box('card-open', 'title');
    camTo(tClick + 0.4, tClick + 1.5, pane.x + pane.w / 2, pane.y + 260, 1.35);
    ring(head, at('board', 'everything about', -0.1), end, 8, 10);
    label('Task details', head.x - 12, head.y + head.h / 2, at('board', 'right there', -0.2), end, { side: 'l', size: 15 });
    windowOut(end + 0.6);
});

// ------------------------------------------------------------------ outro: end card
scene('outro', (s) => {
    const g = mk('div', 'layer', fx);
    const wm = wordmark(g, 'Acme', 120, s.S + 0.2);
    place(wm, 960 - wm.offsetWidth / 2, 360);
    const tag = mk('div', 'tagline', g, 'Free to start.');
    tag.style.top = '520px';
    show(tag, at('outro', 'Free to start', -0.1), null, { dy: 14, inD: 0.7 });
    const url = mk('div', 'tagline', g, 'acme.example');
    url.style.cssText += ';top:600px;font-size:26px';
    show(url, at('outro', 'ready when', 0), null, { dy: 12, inD: 0.7 });
});
