---
name: bracit-worklog
description: Fill BRAC IT worklogs from just the dates. Reconstructs what the user worked on each day from their Claude Code sessions and git history, writes a one-line description per day, and adds the entries to BRAC IT's Portfolio Manager (portfoliomanager.bracits.com, General Worklogs) — and Jira at tim.brac.net when enabled — through the user's signed-in Chrome, without further questions. Use when the user says "log my work/hours/worklog", "fill portfolio manager", "presales log", "timesheet for <dates>", or invokes /bracit-worklog with dates.
---

# BRAC IT worklog filler

The user gives dates; you do the rest. **Invoking this skill with dates is the user's instruction to submit those
worklogs.** Do not ask for confirmation, categories, projects, hours or descriptions — use the defaults in
`config.json` and the evidence. Stop and ask only when genuinely blocked (see "When to stop").

Files (in this skill's directory):
- `config.json` — defaults: category, project, minutes per day, Jira settings, repo roots, git author names.
- `scripts/collect_work.py` — prints JSON evidence per day (session prompts, commits, files changed), secrets redacted.
- `reference/portfolio-manager.md` — the exact, verified way to fill the Portfolio Manager form. Read it before step 4.
- `reference/jira.md` — Jira (tim.brac.net) approach; only when `jira.enabled` is true.

## 1. Read the request

- **Dates**: accept any form — `2026-09-29`, `29 sep`, `29 and 30 september`, `1-5 oct`, `yesterday`, `last week`.
  Resolve to ISO dates in Asia/Dhaka. Year defaults to the current year; a month name with no year that lies in the
  future means last year.
- **Optional overrides** in the same message (all optional): hours or minutes ("4h", "240 min"), category
  ("R&D", "Presales"…), project ("Internal Service & RnD"…), a **topic** ("hr chatbot", "ocr", a repo name) to limit
  which work is described, "jira too" / "portfolio only", "dry run" (prepare everything, submit nothing).
- Anything not given comes from `config.json`.
- Ranges ("1-5 oct", "last week") leave out the `skip_weekends` days (Friday, Saturday) unless that day has
  evidence of work. A weekend date the user names explicitly is always considered.

## 2. Gather evidence

Run:

```bash
python3 ~/.claude/skills/bracit-worklog/scripts/collect_work.py <date> [<date> ...]
```

For each day it returns projects with the user's own prompts, commits and changed files. If a topic was given, keep
only projects whose name or prompts match it (e.g. "hr chatbot" → bits-hr-payroll / Ridhi). Otherwise use the
project(s) with the most evidence that day.

## 3. Write one description per day

- One line, at most `description_max_chars` (300) characters, past-tense outcomes, no filler:
  `HR chatbot (Ridhi): <what was built/fixed>; <second thing>; <third thing>`.
- Describe outcomes the evidence supports. Never invent work, people, tickets or numbers.
- Never include passwords, keys, tokens, IP addresses, usernames or customer data — even if they appear in the
  evidence (the script redacts most; double-check).
- If one day spans several projects, lead with the main one and mention the others briefly, in the same entry.

## 4. Portfolio Manager (when `portfolio_manager.enabled`)

Browser: use the Claude in Chrome tools. Load them in ONE ToolSearch call (tabs_context_mcp, tabs_create_mcp,
navigate, computer, find, form_input, get_page_text). Create your own tab.

1. Open `url + list_path` (`/my-un-billable-worklogs`). If you land on a sign-in page, stop: ask the user to sign in
   (never type their password), then continue.
2. Read the existing rows. Skip any date that already has an entry with the same category; report it as "already
   logged".
3. Add each remaining day exactly as `reference/portfolio-manager.md` describes (Category and Project are custom
   dropdowns: click, click the search box, type, click the match).
4. Re-read the list and confirm every new row (date, minutes, category, project).

## 5. Jira (only when `jira.enabled`)

Follow `reference/jira.md`: REST calls from a tab on tim.brac.net using the user's session. Same description,
`hours_per_day` hours, starting `start_time`. Skip days already logged by the user on that issue.

## 6. Report

A short table: date · minutes · category · project · description (shortened) · status (added / already logged /
skipped: no work found). Then one line on anything that needs the user (e.g. Jira disabled, sign-in needed).
Close the tab you created unless the user wants to see the list.

## When to stop (the only reasons to ask)

- The browser extension is not connected, or the user is signed out of a site. Say exactly what to do, then wait.
- A date has **no evidence of work** and the user gave no topic or description: do not invent one. Log the other
  days and list that date as "skipped: no work found", offering to log it if they tell you what they did.
- A dropdown no longer contains the configured category or project: pick nothing, report the available options.
- A "dry run" was requested: show the prepared entries and stop.

## Changing defaults

Edit `config.json` (or tell Claude "make R&D the default category", "use 8 hours", "enable Jira with PBI-123") and it
applies to every later run.
