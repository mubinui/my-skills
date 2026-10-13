"""Deliverables from out/picture.mp4 + out/mix.wav:

  out/<name>-<H>p.mp4   the master: picture copied untouched, AAC 320 kb/s
  out/<name>-1080p.mp4  downscaled from the 4K master (Lanczos), for feeds that
                        reject 4K or re-encode it badly (LinkedIn, X, Slack)
  out/<name>.srt        captions, from the same chunks the engine burns in
  out/contact.jpg       one frame every few seconds on a sheet, to review the cut

Then checks the result: duration of picture vs sound, loudness, colour tags.
"""
import json
import subprocess

info = json.load(open("info.json"))
cfg = json.load(open("film.config.json"))
name = cfg.get("name", "film")


def run(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def probe(path):
    return json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                      "stream=codec_type,width,height,r_frame_rate,color_space,color_primaries,color_transfer:format=duration,bit_rate",
                                      "-of", "json", path], capture_output=True, text=True, check=True).stdout)


encoders = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
# AudioToolbox AAC (macOS) is clearly better than ffmpeg's native encoder at the same rate.
aac = ["-c:a", "aac_at", "-b:a", "320k"] if " aac_at " in encoders else ["-c:a", "aac", "-b:a", "320k"]
tags = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]

src = probe("out/picture.mp4")
v = next(s for s in src["streams"] if s["codec_type"] == "video")
master = f"out/{name}-{v['height']}p.mp4"
run("-i", "out/picture.mp4", "-i", "out/mix.wav", "-map", "0:v", "-map", "1:a", "-c:v", "copy", *aac, "-shortest", "-movflags", "+faststart", master)
outputs = [master]
if v["height"] > 1080:
    small = f"out/{name}-1080p.mp4"
    run("-i", master, "-map", "0", "-vf", "scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-g", str(info["fps"] * 2), "-x264-params", "aq-mode=3",
        *tags, "-c:a", "copy", "-movflags", "+faststart", small)
    outputs.append(small)


def ts(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


with open(f"out/{name}.srt", "w") as f:
    for i, c in enumerate(info["captions"], 1):
        f.write(f"{i}\n{ts(c['t0'])} --> {ts(c['t1'])}\n{c['text']}\n\n")

every = max(2, round(info["total"] / 24))
run("-i", master, "-vf", f"fps=1/{every},scale=640:-2,tile=4x6:padding=8:margin=8", "-frames:v", "1", "-q:v", "3", "out/contact.jpg")

# ------------------------------------------------------------------ checks
problems = []
for path in outputs:
    p = probe(path)
    dur = {s["codec_type"]: s for s in p["streams"]}
    vv = dur["video"]
    if vv.get("color_primaries") != "bt709" or vv.get("color_space") != "bt709":
        problems.append(f"{path}: colour not tagged BT.709 ({vv.get('color_space')}/{vv.get('color_primaries')})")
    print(f"{path}: {vv['width']}x{vv['height']} {vv['r_frame_rate']} fps, {float(p['format']['duration']):.2f}s, "
          f"{int(p['format']['bit_rate']) / 1e6:.1f} Mb/s")
lufs = subprocess.run(["ffmpeg", "-v", "info", "-i", master, "-map", "0:a", "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
lufs = json.loads(lufs[lufs.rindex("{"): lufs.rindex("}") + 1])
print(f"loudness {lufs['input_i']} LUFS, true peak {lufs['input_tp']} dBTP")
if abs(float(lufs["input_i"]) + 14) > 1:
    problems.append(f"loudness {lufs['input_i']} LUFS, expected -14")
if abs(float(probe(master)["format"]["duration"]) - info["total"]) > 0.1:
    problems.append(f"master is {probe(master)['format']['duration']}s, the timeline is {info['total']:.2f}s")
print(f"out/{name}.srt: {len(info['captions'])} captions; out/contact.jpg: a frame every {every}s")
print("\n".join(["PROBLEMS:", *problems]) if problems else "checks passed")
raise SystemExit(1 if problems else 0)
