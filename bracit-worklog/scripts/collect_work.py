#!/usr/bin/env python3
"""Collect evidence of what was worked on, per day, so worklog descriptions can be written without asking.

Sources (all local, read-only):
  * Claude Code session logs (~/.claude/projects/*/*.jsonl): the user's own prompts on that day, by project
  * git commits by the user on that day, in every repo under the configured roots
  * files changed that day in those repos (committed or not)

Usage:
  collect_work.py 2026-09-29 2026-09-30            # dates in Asia/Dhaka unless config says otherwise
  collect_work.py --config ~/.claude/skills/bracit-worklog/config.json 2026-10-01

Prints JSON: {"2026-09-29": {"weekday": "Tuesday", "working_day": true, "holiday": null,
                               "projects": {"bits-hr-payroll": {"prompts": [...], "commits": [...], "files_changed": 37}}}}
A day off (outside config "work_week", or listed in config "holidays") gets "working_day": false and "log_on": the
next working day, where its work (if any) is reported instead. "holiday_list_missing": true means config has no
holidays for that year yet.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
NOISE = re.compile(
    r"^(Your response above was cut off|\[Request interrupted|<|Tool loaded|Caveat:|\[Image|continue$|yes$|ok$)", re.I
)
# Never let credentials reach a worklog: passwords, keys, tokens, long secrets, and user/IP lines.
SECRETS = [
    re.compile(r"(?i)\b(password|passwd|pass|pwd|secret|token|api[_ -]?key|key)\b\s*[:=]\s*\S+"),
    re.compile(r"(?i)\b(user(name)?|login)\s*[:=]\s*\S+"),
    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    re.compile(r"\b(?:sk|pk|ghp|gho|xox[abp]|AIza)[A-Za-z0-9_\-]{10,}\b"),
    re.compile(r"\b[A-Za-z0-9+/_\-]{32,}={0,2}"),
]


def redact(text: str) -> str:
    for pattern in SECRETS:
        text = pattern.sub("[redacted]", text)
    return text


IDE_NOISE = re.compile(r"^(<ide_|<system-reminder|\[Image|<command-|Base directory for this skill)", re.I)


def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def tz_from(cfg: dict) -> timezone:
    hours = float(cfg.get("utc_offset_hours", 6))
    return timezone(timedelta(hours=hours))


def local_day(ts: str, tz: timezone) -> str | None:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(tz).date().isoformat()
    except ValueError:
        return None


def prompts_by_day(days: set[str], tz: timezone) -> dict:
    out: dict = defaultdict(lambda: defaultdict(list))
    root = Path.home() / ".claude" / "projects"
    for f in root.glob("*/*.jsonl"):
        try:
            if datetime.fromtimestamp(f.stat().st_mtime).date() < min(date.fromisoformat(d) for d in days) - timedelta(days=1):
                continue  # last written before the earliest day: cannot contain it
        except OSError:
            continue
        with open(f, encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if '"type":"user"' not in line and '"type": "user"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                content = d.get("message", {}).get("content")
                if isinstance(content, list):
                    # Typed messages arrive as blocks: keep the user's text, drop tool results, images, IDE context.
                    content = " ".join(
                        b.get("text", "") for b in content
                        if isinstance(b, dict) and b.get("type") == "text" and not IDE_NOISE.match(b.get("text", "").strip())
                    )
                if not isinstance(content, str) or not content.strip():
                    continue
                day = local_day(d.get("timestamp", ""), tz)
                text = " ".join(content.split())
                if day not in days or len(text) < 8 or NOISE.match(text):
                    continue
                project = Path(d.get("cwd") or "unknown").name
                # Group nested folders (assistant/agent) under their repo when we can tell.
                cwd = Path(d.get("cwd") or "")
                for parent in [cwd, *cwd.parents]:
                    if (parent / ".git").exists():
                        project = parent.name
                        break
                text = redact(text)
                if text not in out[day][project]:
                    out[day][project].append(text[:400])
    return out


def git(repo: Path, *args: str) -> str:
    try:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def repos(cfg: dict) -> list[Path]:
    found = []
    for root in cfg.get("repo_roots", ["~/Home/AI Projects"]):
        base = Path(os.path.expanduser(root))
        if not base.exists():
            continue
        for git_dir in base.glob("*/.git"):
            found.append(git_dir.parent)
        for git_dir in base.glob("*/*/.git"):
            found.append(git_dir.parent)
    return sorted(set(found))


def git_by_day(days: set[str], cfg: dict, tz: timezone) -> dict:
    out: dict = defaultdict(lambda: defaultdict(dict))
    authors = cfg.get("git_authors", [])
    first = min(days)
    last = (date.fromisoformat(max(days)) + timedelta(days=1)).isoformat()
    for repo in repos(cfg):
        args = ["log", "--all", f"--since={first} 00:00", f"--until={last} 00:00", "--date=iso-strict", "--format=%ad\t%s", "--no-merges"]
        for a in authors:
            args.append(f"--author={a}")
        for row in git(repo, *args).splitlines():
            if "\t" not in row:
                continue
            when, subject = row.split("\t", 1)
            day = local_day(when, tz)
            if day in days:
                out[day][repo.name].setdefault("commits", []).append(redact(subject)[:200])
        # Uncommitted or committed changes whose files were modified that day.
        names = git(repo, "ls-files", "-m", "-o", "--exclude-standard").splitlines()
        names += git(repo, "log", f"--since={first} 00:00", f"--until={last} 00:00", "--name-only", "--format=").splitlines()
        counts: dict = defaultdict(set)
        for n in {x for x in names if x}:
            p = repo / n
            try:
                day = datetime.fromtimestamp(p.stat().st_mtime, tz).date().isoformat()
            except OSError:
                continue
            if day in days:
                counts[day].add(n)
        for day, files in counts.items():
            entry = out[day][repo.name]
            entry["files_changed"] = len(files)
            entry["sample_files"] = sorted(files)[:15]
    return out


def day_off(d: date, cfg: dict) -> tuple[bool, str | None]:
    """(is a day off, holiday name) — weekends per config work_week, holidays per config holidays."""
    holiday = cfg.get("holidays", {}).get(d.isoformat())
    week = cfg.get("work_week", ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"])
    return holiday is not None or d.strftime("%A") not in week, holiday


def next_working_day(d: date, cfg: dict) -> date:
    d += timedelta(days=1)
    while day_off(d, cfg)[0]:
        d += timedelta(days=1)
    return d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dates", nargs="+", help="YYYY-MM-DD")
    ap.add_argument("--config", default=str(SKILL_DIR / "config.json"))
    a = ap.parse_args()
    cfg = load_config(Path(a.config))
    tz = tz_from(cfg)
    days = {date.fromisoformat(d).isoformat() for d in a.dates}
    prompts = prompts_by_day(days, tz)
    gits = git_by_day(days, cfg, tz)
    result = {}
    for day in sorted(days):
        projects: dict = defaultdict(dict)
        for name, items in prompts.get(day, {}).items():
            projects[name]["prompts"] = items[:40]
        for name, info in gits.get(day, {}).items():
            projects[name].update(info)
        d = date.fromisoformat(day)
        off, holiday = day_off(d, cfg)
        entry = {"weekday": d.strftime("%A"), "working_day": not off, "holiday": holiday}
        if off:
            entry["log_on"] = next_working_day(d, cfg).isoformat()
        if not any(h.startswith(f"{d.year}-") for h in cfg.get("holidays", {})):
            entry["holiday_list_missing"] = True
        entry["projects"] = projects
        result[day] = entry
    print(json.dumps(result, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
