"""The time of every spoken word, so at(id, phrase) lands marks on the word
itself rather than on a guess from its character position.

    python3 align.py [ids...]    -> voice/words/<id>.json

With a real OpenAI key (OPENAI_API_KEY, not an OpenRouter sk-or- key) it asks
Whisper for word timestamps. Without one, or if Whisper fails, it anchors on the
pauses in the recording: each pause is matched to the punctuation the narrator
paused at, and words are spread by length only within the stretch between two
pauses. That is offline, free, and typically within ~0.1 s at every comma and
full stop, where most beats are timed.

Cached by the trimmed file's content, so unchanged lines are not redone.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

import numpy as np

from tts import openai_key, transcribe

SR = 16000
only = set(sys.argv[1:])
os.makedirs("voice/words", exist_ok=True)
use_whisper = openai_key() is not None


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def pauses(x, min_gap=0.12):
    """(start, end) of each silence of at least min_gap inside the line, in time order."""
    hop = SR // 100
    env = np.sqrt((x[: len(x) // hop * hop].reshape(-1, hop) ** 2).mean(1))
    quiet = env < env.max() * 10 ** (-32 / 20)
    out, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            if i > 0 and j < len(quiet) and (j - i) / 100 >= min_gap:
                out.append((i / 100, j / 100))
            i = j
        else:
            i += 1
    return out


def by_pauses(text, x):
    dur = len(x) / SR
    words = [(m.start(), m.group()) for m in re.finditer(r"\S+", text)]
    # Candidate breaks: after a word ending in punctuation, as a character offset.
    breaks = [(i, s + len(w)) for i, (s, w) in enumerate(words[:-1]) if re.search(r"[,.;:!?—-]$", w)]
    gaps = pauses(x)
    n = len(text)
    # Monotonic DP: match pauses to breaks minimising time error against the
    # character-rate estimate; either may go unmatched (a breath, a run-on comma).
    B, P = len(breaks), len(gaps)
    exp = [dur * c / n for _, c in breaks]
    mid = [(a + b) / 2 for a, b in gaps]
    SKIP = 0.6
    cost = np.full((B + 1, P + 1), np.inf); cost[0, :] = np.arange(P + 1) * SKIP; cost[:, 0] = np.arange(B + 1) * SKIP
    back = {}
    for i in range(1, B + 1):
        for j in range(1, P + 1):
            options = [(cost[i - 1, j - 1] + abs(exp[i - 1] - mid[j - 1]), (i - 1, j - 1, True)),
                       (cost[i - 1, j] + SKIP, (i - 1, j, False)), (cost[i, j - 1] + SKIP, (i, j - 1, False))]
            cost[i, j], back[i, j] = min(options, key=lambda o: o[0])
    pairs, i, j = [], B, P
    while i > 0 and j > 0:
        pi, pj, matched = back[i, j]
        if matched:
            pairs.append((breaks[i - 1][0], gaps[j - 1]))
        i, j = pi, pj
    pairs.reverse()
    # Segments of words between matched pauses; spread each segment's words over its speech.
    out, first, t0 = [], 0, 0.0
    for last_word, (ga, gb) in pairs + [(len(words) - 1, (dur, dur))]:
        seg = words[first: last_word + 1]
        chars = sum(len(w) + 1 for _, w in seg)
        c = 0
        for _, w in seg:
            a = t0 + (ga - t0) * c / chars; c += len(w) + 1
            out.append({"w": w, "start": round(a, 3), "end": round(t0 + (ga - t0) * (c - 1) / chars, 3)})
        first, t0 = last_word + 1, gb
    return out, len(pairs), len(gaps)


for line in json.load(open("script.json")):
    if only and line["id"] not in only:
        continue
    wav = f"voice/trim/{line['id']}.wav"
    sha = hashlib.sha1(open(wav, "rb").read()).hexdigest()
    out = f"voice/words/{line['id']}.json"
    if os.path.exists(out) and json.load(open(out)).get("sha") == sha and (json.load(open(out))["method"] == "whisper" or not use_whisper):
        continue
    method = "pauses"
    if use_whisper:
        try:
            words, method = transcribe(wav, words=True)["words"], "whisper"
            note = f"{len(words)} words"
        except RuntimeError as e:
            print(f"  {line['id']}: {e}; falling back to pauses")
            use_whisper = False
    if method == "pauses":
        words, matched, found = by_pauses(line["text"], load(wav))
        note = f"{len(words)} words, {matched} of {found} pauses anchored"
    json.dump({"sha": sha, "method": method, "words": words}, open(out, "w"), indent=1)
    print(f"{line['id']:12} {method:8} {note}")
