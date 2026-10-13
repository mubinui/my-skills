"""Collect everything film.html needs into data.js: the config, the script with
the measured length (and word timings) of every trimmed line, and the element
boxes from the capture. Run after capture, trim and align; re-run after any of them."""
import json
import os
import subprocess

config = json.load(open("film.config.json"))
script = json.load(open("script.json"))
for line in script:
    wav = f"voice/trim/{line['id']}.wav"
    if not os.path.exists(wav):
        raise SystemExit(f"missing {wav}: run voice.py and trim.py for {line['id']}")
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
                         capture_output=True, text=True, check=True)
    line["dur"] = round(float(out.stdout), 3)
    words = f"voice/words/{line['id']}.json"
    if os.path.exists(words):
        line["words"] = json.load(open(words))["words"]
boxes = json.load(open("shots/boxes.json")) if os.path.exists("shots/boxes.json") else {}
open("data.js", "w").write("window.FILM = " + json.dumps({"config": config, "script": script, "boxes": boxes}) + ";\n")
total = sum(l["dur"] for l in script)
print(f"{len(script)} lines, {total:.1f}s of voice, {sum('words' in l for l in script)} aligned, {len(boxes)} screens")
