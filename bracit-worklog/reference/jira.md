# Jira (tim.brac.net): logging work — currently DISABLED in config.json

BRAC's Jira is a self-hosted Jira Server / Data Center at https://tim.brac.net (not Atlassian Cloud).
Confirmed 2026-10-04: `/rest/api/2/issue/{key}/worklog` exists (401 when signed out). A Tempo plugin may also be
installed (`/rest/tempo-timesheets/4/` redirects to login). **Not yet tested signed in** — do a dry run first.

## Approach: REST from the signed-in browser tab

The user signs in at tim.brac.net in Chrome themselves. Then, in a tab on that origin, use `javascript_tool` so the
request carries their session cookie (never handle their password or create API tokens):

```js
// 1. Who am I? (also proves the session works)
await (await fetch('/rest/api/2/myself')).json()

// 2. Which issue? config.jira.issue_key, else the JQL in config.jira.auto_pick_jql
await (await fetch('/rest/api/2/search?maxResults=5&fields=summary,status&jql=' + encodeURIComponent(JQL))).json()

// 3. Already logged that day? (avoid duplicates)
await (await fetch(`/rest/api/2/issue/${KEY}/worklog`)).json()   // check worklogs[].author.name + started date

// 4. Log it
await fetch(`/rest/api/2/issue/${KEY}/worklog`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' },
  body: JSON.stringify({
    started: '2026-09-29T09:00:00.000+0600',   // date + config.jira.start_time + config.jira.utc_offset
    timeSpentSeconds: 6 * 3600,                 // config.jira.hours_per_day
    comment: DESCRIPTION
  })
}).then(r => r.status)                           // 201 = created
```

If the REST call is refused (XSRF or permissions), fall back to the UI: open the issue, **More → Log work**, fill
Time Spent (`6h`), Date Started, Work Description, then **Log**.

## Enabling

Set `jira.enabled` to `true` in config.json, and either set `jira.issue_key` (e.g. "PBI-123") or keep
`auto_pick_jql`. On the first enabled run, read step 1–3 results to the user once and confirm the issue choice works.
