# MySkills

My personal Claude Code skills. This folder is `~/.claude/skills`, so every skill here is available in Claude Code
from any project on this machine.

| Skill | What it does |
|---|---|
| `bracit-worklog` | Give it dates; it works out what I did each day (Claude Code sessions + git history, secrets redacted) and fills BRAC IT's Portfolio Manager General Worklogs through Chrome. Jira (tim.brac.net) support is included but disabled in `config.json`. |
| `grill-me` | Interviews me relentlessly about a plan until we share an understanding. |
| `grilling` | The same grilling workflow as a design tree, asked in rounds with recommended answers. |
| `impeccable` | Third-party frontend design skill (v4.3.1): design, critique, audit and polish UIs. |
| `macos27-glass-ui` | Applies the macOS 27 "Liquid Glass" design system (from Weft) to a web frontend. |
| `product-film` | Narrated product videos of a web app: real screenshots, a deterministic HTML timeline, verified TTS voice, word-timed callouts, 4K60 BT.709 render, ducked music and -14 LUFS mix, captions. Ships a copy-in kit. |

## Use on another machine

```sh
git clone https://github.com/mubinui/MySkills.git ~/.claude/skills
```

Anthropic's built-in skills (`synced/`) are synced by the Claude app and are deliberately not in this repo.
