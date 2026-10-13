"""Voice every line of script.json, keeping only takes that say exactly the text.

    python3 voice.py              # every line
    python3 voice.py board outro  # just these (after editing their text)

A take is accepted when its transcript matches the text (>= 0.97 word-sequence
similarity) and its pace is human (1.6-3.6 words a second). Otherwise it is
re-voiced, up to 4 times, keeping the best. Writes voice/lines/<id>.wav and
voice/takes.json; prints any line that never passed so you can listen to it.
"""
import difflib
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

from tts import openai_key, speak, transcribe

CFG = json.load(open("film.config.json"))["voice"]
lines = json.load(open("script.json"))
only = set(sys.argv[1:])
os.makedirs("voice/lines", exist_ok=True)
can_whisper = openai_key() is not None


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower().replace("-", " ")).split()


def score(line, take):
    words = len(norm(line["text"]))
    pace = words / max(take["seconds"], 0.1)
    heard = take["transcript"]
    if heard is None and can_whisper:
        try:
            heard = transcribe(take["path"])["text"]
        except RuntimeError as e:
            print(f"  {line['id']}: {e}; checking pace only")
    match = difflib.SequenceMatcher(None, norm(line["text"]), norm(heard)).ratio() if heard is not None else None
    ok = (match is None or match >= 0.97) and 1.6 <= pace <= 3.6
    return {"match": None if match is None else round(match, 3), "pace": round(pace, 2), "heard": heard, "ok": ok}


def voice(line):
    best = None
    for attempt in range(4):
        path = f"voice/lines/{line['id']}.take{attempt}.wav"
        take = speak(line["text"], path, CFG)
        take["path"] = path
        take.update(score(line, take))
        if best is None or (take["ok"], take["match"] or 0) > (best["ok"], best["match"] or 0):
            best = take
        if take["ok"]:
            break
    os.replace(best["path"], f"voice/lines/{line['id']}.wav")
    for f in os.listdir("voice/lines"):
        if f.startswith(line["id"] + ".take"):
            os.remove(f"voice/lines/{f}")
    return {"id": line["id"], **{k: best[k] for k in ("seconds", "match", "pace", "ok", "heard")}}


todo = [l for l in lines if not only or l["id"] in only]
unknown = only - {l["id"] for l in lines}
if unknown:
    raise SystemExit(f"not in script.json: {', '.join(sorted(unknown))}")
with ThreadPoolExecutor(4) as pool:
    results = list(pool.map(voice, todo))
try:
    takes = json.load(open("voice/takes.json"))
except FileNotFoundError:
    takes = {}
for r in results:
    takes[r["id"]] = r
    flag = "" if r["ok"] else f"   <- CHECK: heard {r['heard']!r}"
    print(f"{r['id']:12} {r['seconds']:6.2f}s  match {r['match']}  {r['pace']} w/s{flag}")
json.dump(takes, open("voice/takes.json", "w"), indent=1)
if not can_whisper and CFG.get("provider") == "gemini":
    print("note: no OpenAI key, so Gemini takes were checked for pace only; listen to them.")
