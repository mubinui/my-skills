"""Mix the film's sound from info.json (written by `node render.mjs info`):
narration at each line's start, a sound effect at every cue, and the music bed
ducked under the voice. Two-pass loudness normalisation to -14 LUFS / -1.5 dBTP
(what YouTube, LinkedIn and most players target). Writes out/mix.wav.

Music plan (film.config.json "music", or music({...}) in scenes.js), null for none:
  file      path to the track (licensed for this use: Mixkit, Pixabay, Artlist ...)
  offset    seconds into the track at film time 0 (line a drop up with a beat)
  db        bed level in the gaps (default -6; under the voice it drops a further duck)
  duck      dB the bed gives way while someone speaks (default 9)
  fadeOut   seconds of fade at the end (default 2.5)
  splice, jumpTo, hit   optional bar-aligned ending: at film time `splice` cross
            to track time `jumpTo` (on the bar, one-beat equal-power crossfade),
            so the track's own build lands its hit at film time `hit`; after the
            hit it rings down instead of stopping.
"""
import json
import os
import subprocess

import numpy as np

SR = 48000
info = json.load(open("info.json"))
N = int((info["total"] + 0.5) * SR)
os.makedirs("out", exist_ok=True)


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def peak_norm(x, db=-1.0):
    return x * (10 ** (db / 20) / max(1e-9, np.abs(x).max()))


def place(bus, clip, t, gain_db=0.0):
    i = int(round(t * SR))
    if i < 0:
        clip, i = clip[-i:], 0
    if i >= len(bus):
        return
    clip = clip[: len(bus) - i] * (10 ** (gain_db / 20))
    bus[i: i + len(clip)] += clip


# ------------------------------------------------------------------ voice
voice = np.zeros((N, 2), np.float32)
for line in info["voice"]:
    place(voice, load(f"voice/trim/{line['id']}.wav"), line["t"])

# ------------------------------------------------------------------ effects
kinds = {k: v for k, v in json.load(open("sfx.json")).items() if not k.startswith("_")}
clips = {}
sfx = np.zeros((N, 2), np.float32)
count = {}
for c in info["cues"]:
    k = c["kind"]
    if k not in kinds:
        raise SystemExit(f"cue kind {k!r} is not in sfx.json")
    if k not in clips:
        clips[k] = [peak_norm(load(p)) for p in kinds[k]["files"]]
    i = count.get(k, 0); count[k] = i + 1
    place(sfx, clips[k][i % len(clips[k])], c["t"], kinds[k]["db"] + 20 * np.log10(max(c["gain"], 1e-3)))

# ------------------------------------------------------------------ music
music = np.zeros((N, 2), np.float32)
plan = info.get("music")
t = np.arange(N) / SR
if plan:
    song = load(plan["file"])

    def seg(start, length):
        i = int(round(start * SR)); n = int(round(length * SR))
        out = song[max(0, i): max(0, i) + n]
        if i < 0:
            out = np.concatenate([np.zeros((-i, 2), np.float32), out])[:n]
        return np.pad(out, ((0, n - len(out)), (0, 0)))

    if plan.get("splice") is not None:
        splice, XF = plan["splice"], plan.get("crossfade", 0.5)
        a_len = splice + XF / 2
        music[: int(round(a_len * SR))] += seg(plan["offset"], a_len)
        b_start = splice - XF / 2
        b = seg(plan["jumpTo"] - XF / 2, info["total"] + 0.5 - b_start)
        i0 = int(round(b_start * SR)); nx = int(round(XF * SR)); ramp = np.linspace(0, np.pi / 2, nx)
        music[i0: i0 + nx] *= np.cos(ramp)[:, None]
        b[:nx] *= np.sin(ramp)[:, None]
        L = min(len(b), N - i0)
        music[i0: i0 + L] += b[:L]
        hit = plan["hit"]
        after = np.clip((t - (hit + 0.35)) / max(0.1, info["total"] - hit - 0.35), 0, 1)
        tail = np.where(t < hit + 0.35, 1.0, 10 ** (-42 * after ** 1.3 / 20))
    else:
        music[:] = seg(plan.get("offset", 0), N / SR)
        fo = plan.get("fadeOut", 2.5)
        tail = np.cos(np.clip((t - (info["total"] - fo)) / fo, 0, 1) * np.pi / 2) ** 2
    fade_in = np.clip(t / 0.8, 0, 1)
    # Duck under the voice: 10 ms envelope, 80 ms attack, 600 ms release.
    hop = SR // 100
    env = np.abs(voice[:, 0])[: N // hop * hop].reshape(-1, hop).mean(1)
    active = (env > 0.01).astype(np.float32)
    duck = np.zeros_like(active); level = 0.0
    for i, a in enumerate(active):
        level += (a - level) * (0.12 if a > level else 0.017)
        duck[i] = level
    gain_db = plan.get("db", -6.0) - plan.get("duck", 9.0) * duck
    g = np.repeat(10 ** (gain_db / 20), hop)
    g = np.pad(g, (0, N - len(g)), mode="edge")
    music *= (g * fade_in * tail)[:, None]

# ------------------------------------------------------------------ master
mix = voice + sfx + music
mix[int(info["total"] * SR):] = 0
open("out/premix.f32", "wb").write(mix.astype(np.float32).tobytes())
base = ["ffmpeg", "-y", "-v", "info", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "out/premix.f32"]
meas = subprocess.run(base + ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
m = json.loads(meas[meas.rindex("{"): meas.rindex("}") + 1])
af = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
      f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample=48000")
subprocess.run(base + ["-af", af, "-t", f"{info['total']:.3f}", "-c:a", "pcm_s24le", "out/mix.wav"], check=True, capture_output=True)
os.remove("out/premix.f32")
print(f"out/mix.wav: input {m['input_i']} LUFS -> -14; cues {count}; music {'yes' if plan else 'none'}")
