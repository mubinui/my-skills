"""Text-to-speech for the narration, and the API keys it needs.

speak(text, out_wav, cfg) -> {"seconds": float, "transcript": str | None}

Providers (film.config.json "voice.provider"):
  openrouter  openai/gpt-audio through OpenRouter. Streams PCM16 and returns the
              model's own transcript, so every take can be checked. Voices:
              marin, cedar, sage, alloy, ash, ballad, coral, echo, shimmer, verse.
  openai      the same model on api.openai.com (OPENAI_API_KEY).
  gemini      Gemini TTS (GEMINI_API_KEY). Voices: Sulafat (warm), Achernar,
              Vindemiatrix, Leda, Kore, Puck, Charon ... No transcript: voice.py
              checks the take with Whisper when OPENAI_API_KEY is set.
"""
from __future__ import annotations

import base64
import json
import os
import pathlib
import time
import urllib.error
import urllib.request
import wave


def key(name: str, required: bool = True) -> str | None:
    """An API key from the environment, else from the nearest .env up from here."""
    if os.environ.get(name):
        return os.environ[name]
    for d in [pathlib.Path.cwd(), *pathlib.Path.cwd().parents]:
        env = d / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    if required:
        raise SystemExit(f"{name} is not set (environment or a .env above {pathlib.Path.cwd()})")
    return None


def openai_key() -> str | None:
    """A usable OpenAI key, or None. An OpenRouter key (sk-or-...) in OPENAI_API_KEY does not count."""
    k = key("OPENAI_API_KEY", required=False)
    return k if k and not k.startswith("sk-or-") else None


def _write(out: str, pcm: bytes, rate: int = 24000) -> float:
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return round(len(pcm) / 2 / rate, 2)


def _retry(fn, attempts: int = 4):
    last = None
    for i in range(attempts):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (408, 429, 500, 502, 503, 504):
                raise SystemExit(f"TTS rejected the request ({e.code}): {e.read()[:300]!r}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
        time.sleep(2 ** i * 2)
    raise SystemExit(f"TTS failed after {attempts} attempts: {last}")


def _gpt_audio(text: str, out: str, cfg: dict, url: str, api_key: str) -> dict:
    body = {
        "model": cfg.get("model", "openai/gpt-audio" if "openrouter" in url else "gpt-audio"),
        "modalities": ["text", "audio"],
        "audio": {"voice": cfg.get("voice", "marin"), "format": "pcm16"},
        "stream": True,
        "messages": [{"role": "system", "content": cfg["style"]}, {"role": "user", "content": text}],
    }

    def call():
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        pcm, transcript = bytearray(), []
        with urllib.request.urlopen(req, timeout=180) as resp:
            for raw in resp:
                line = raw.decode().strip()
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue
                for choice in json.loads(line[6:]).get("choices", []):
                    audio = (choice.get("delta") or {}).get("audio") or {}
                    if audio.get("data"):
                        pcm += base64.b64decode(audio["data"])
                    if audio.get("transcript"):
                        transcript.append(audio["transcript"])
        return bytes(pcm), "".join(transcript)

    pcm, transcript = _retry(call)
    return {"seconds": _write(out, pcm), "transcript": transcript}


def _gemini(text: str, out: str, cfg: dict) -> dict:
    model = cfg.get("model", "gemini-2.5-pro-preview-tts")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key('GEMINI_API_KEY')}"
    # Gemini takes delivery direction as a prefix to the text itself.
    style = cfg.get("style_prefix", "Read this warmly, at a natural, measured pace: ")
    payload = {
        "contents": [{"parts": [{"text": style + text}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cfg.get("voice", "Sulafat")}}}},
    }

    def call():
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.load(resp)
        try:
            return base64.b64decode(body["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
        except (KeyError, IndexError):
            raise ConnectionError(f"no audio returned: {json.dumps(body)[:200]}")

    return {"seconds": _write(out, _retry(call)), "transcript": None}


def speak(text: str, out: str, cfg: dict) -> dict:
    provider = cfg.get("provider", "openrouter")
    if provider == "openrouter":
        return _gpt_audio(text, out, cfg, "https://openrouter.ai/api/v1/chat/completions", key("OPENROUTER_API_KEY"))
    if provider == "openai":
        return _gpt_audio(text, out, cfg, "https://api.openai.com/v1/chat/completions", key("OPENAI_API_KEY"))
    if provider == "gemini":
        return _gemini(text, out, cfg)
    raise SystemExit(f"unknown voice provider {provider!r}")


def transcribe(path: str, words: bool = False) -> dict:
    """Whisper (OpenAI) on a local file: {"text", "words": [{"w","start","end"}]}."""
    boundary = "----film" + os.urandom(8).hex()
    fields = [("model", "whisper-1"), ("response_format", "verbose_json"), ("language", "en")]
    if words:
        fields.append(("timestamp_granularities[]", "word"))
    parts = []
    for k, v in fields:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{pathlib.Path(path).name}"\r\n'
                 f"Content-Type: audio/wav\r\n\r\n".encode() + pathlib.Path(path).read_bytes() + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())

    def call():
        req = urllib.request.Request("https://api.openai.com/v1/audio/transcriptions", data=b"".join(parts),
                                     headers={"Authorization": f"Bearer {openai_key()}",
                                              "Content-Type": f"multipart/form-data; boundary={boundary}"})
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.load(resp)

    try:
        body = _retry(call)
    except SystemExit as e:
        raise RuntimeError(f"Whisper failed: {e}") from None
    return {"text": body.get("text", ""),
            "words": [{"w": w["word"], "start": round(w["start"], 3), "end": round(w["end"], 3)} for w in body.get("words", [])]}
