"""Prepare each voiced line for the mix: voice/lines/<id>.wav -> voice/trim/<id>.wav

  - rumble removed (high-pass at 70 Hz),
  - leading and trailing silence cut to 40 ms / 90 ms, with short fades so no
    line starts or ends on a click,
  - every line levelled to the same loudness (-18 LUFS), so no line jumps out,
  - 48 kHz, 24-bit, the rate the mix and the video use.

    python3 trim.py [ids...]
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
TARGET = -18.0
only = set(sys.argv[1:])
os.makedirs("voice/trim", exist_ok=True)


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", "highpass=f=70", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def loudness(x):
    p = subprocess.run(["ffmpeg", "-v", "info", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                        "-af", "loudnorm=print_format=json", "-f", "null", "-"], input=x.tobytes(), capture_output=True)
    err = p.stderr.decode()
    return float(json.loads(err[err.rindex("{"): err.rindex("}") + 1])["input_i"])


for line in json.load(open("script.json")):
    if only and line["id"] not in only:
        continue
    x = load(f"voice/lines/{line['id']}.wav")
    hop = SR // 200                                   # 5 ms envelope
    env = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, mode="same"))
    loud = np.flatnonzero(env > env.max() * 10 ** (-40 / 20))
    a = max(0, loud[0] - int(0.04 * SR)); b = min(len(x), loud[-1] + int(0.09 * SR))
    y = x[a:b].copy()
    fi, fo = int(0.01 * SR), int(0.04 * SR)
    y[:fi] *= np.linspace(0, 1, fi); y[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo))
    gain = TARGET - loudness(y)
    y *= 10 ** (gain / 20)
    if np.abs(y).max() > 0.95:                        # never clip: back off to -0.5 dBFS peak
        y *= 0.95 / np.abs(y).max()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "pcm_s24le", f"voice/trim/{line['id']}.wav"], input=y.tobytes(), check=True)
    print(f"{line['id']:12} {len(x) / SR:6.2f}s -> {len(y) / SR:6.2f}s  {gain:+.1f} dB")
