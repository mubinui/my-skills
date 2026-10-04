#!/usr/bin/env python3
"""Find colours in a codebase that break the macOS 27 Glass palette rules.

The system allows no blue, no orange and no brown anywhere: not as an accent, a link, a focus
ring, a status, a chart colour or a hard-coded canvas fill. The first build this palette came
from still had a sky blue and an amber in canvas code after the CSS was clean, because
hard-coded colours in JS/TS never pass through the tokens. This script finds them.

It flags any colour literal (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla()) that has
real saturation and either a hue from 190 to 250 degrees (blue), or a hue from 12 to 44 degrees
(orange and amber, and brown when it is dark). Apple's system yellow, at 45-55 degrees, is
allowed. Greys, graphite and near-neutral tints are ignored.

Usage:  python3 check_palette.py <dir-or-file> [...]      (exit 1 when anything is flagged)
"""
from __future__ import annotations

import colorsys
import re
import sys
from pathlib import Path

EXTS = {".css", ".scss", ".sass", ".less", ".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".html"}
SKIP_DIRS = {"node_modules", "dist", "build", ".git", ".next", ".venv", "coverage", ".turbo"}

HEX = re.compile(r"#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")
RGB = re.compile(r"rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})")
HSL = re.compile(r"hsla?\(\s*(\d{1,3}(?:\.\d+)?)(?:deg)?[\s,]+(\d{1,3}(?:\.\d+)?)%[\s,]+(\d{1,3}(?:\.\d+)?)%")


def classify(r: float, g: float, b: float) -> str | None:
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    deg = h * 360
    if s < 0.28 or l < 0.08 or l > 0.96:      # greys, graphite, near-black/white
        return None
    if 190 <= deg <= 250:
        return "blue"
    if 12 <= deg <= 44:
        return "brown" if l < 0.38 else "orange"
    return None


def hex_rgb(h: str) -> tuple[float, float, float]:
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h[:3])
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def scan(path: Path) -> list[str]:
    hits = []
    try:
        text = path.read_text(errors="ignore")
    except OSError:
        return hits
    for n, line in enumerate(text.splitlines(), 1):
        found = []
        for m in HEX.finditer(line):
            found.append((m.group(0), hex_rgb(m.group(1))))
        for m in RGB.finditer(line):
            found.append((m.group(0) + ")", tuple(min(255, int(v)) / 255 for v in m.groups())))
        for m in HSL.finditer(line):
            hh, ss, ll = (float(v) for v in m.groups())
            found.append((m.group(0) + ")", colorsys.hls_to_rgb(hh / 360, ll / 100, ss / 100)))
        for literal, rgb in found:
            kind = classify(*rgb)
            if kind:
                hits.append(f"{path}:{n}: {kind:6} {literal}   | {line.strip()[:110]}")
    return hits


def main(argv: list[str]) -> int:
    roots = [Path(a) for a in argv] or [Path(".")]
    hits: list[str] = []
    for root in roots:
        files = [root] if root.is_file() else [
            p for p in root.rglob("*")
            if p.suffix in EXTS and not any(part in SKIP_DIRS for part in p.parts)]
        for f in files:
            hits.extend(scan(f))
    for h in hits:
        print(h)
    print(f"\n{len(hits)} colour(s) outside the palette" if hits else "ok: no blue, orange or brown literals")
    return 1 if hits else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
