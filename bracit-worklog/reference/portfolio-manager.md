# Portfolio Manager: adding a General Worklog (verified 2026-10-04)

Site: https://portfoliomanager.bracits.com (the user signs in themselves; never type a password).

## The form

Open it with the teal **Add General Worklog** button (top centre of every page). Fields:

| Field | Kind | How to set it |
|---|---|---|
| Date | native `<input type="date">` | `form_input` with `YYYY-MM-DD` works. |
| Category | **custom searchable dropdown** | `form_input` changes the hidden select but the UI ignores it. Click the box, click the search field inside the open list, type the category, click the single match. |
| Project | **custom searchable dropdown** | Same as Category. Typing "Internal Service" finds "Internal Service & RnD". |
| Minutes | text input | `form_input` with a number, e.g. `360`. |
| Work Description | single-line text input | `form_input`. Keep it one line, ≤ 300 characters. |

Categories seen: Team Management, Team Meeting, Organization Meeting, Audit Support, Knowledge Share, R&D,
Feasibility Check, Presales, Others, Client Meeting, Regular Operations.

Projects seen (they vary by user): Non-billable Contribution, sbiCloud V3 Preparation, sbiCloud V2 Procurement &
eTender, Internal Service & RnD, BRAC SELP Web Portal & AI Chatbot, EBL SSO Single Sign-on Module.

## Reliable sequence per entry

1. Click **Add General Worklog**; `find` the Date, Minutes and Work Description inputs to get fresh refs.
2. `form_input` Date, Minutes, Work Description.
3. Category: click the dropdown → click the search box inside it (typing before clicking the box does nothing on the
   second and later dialogs) → type → screenshot → click the match.
4. Project: same.
5. Screenshot and check every field shows the intended value (Category and Project must no longer read "Select…").
6. Click **Add** (bottom right of the dialog). A green "Worklog Added Successfully!" toast confirms it.

## Checking how much is already logged: Monthly Timesheet (verified 2026-10-04)

`/monthly-calendar` ("Timesheet" in the sidebar) shows one row per project with an hour count for every day of the
month, and a **Σ Hours** row with the day's total across everything: project timesheets *and* General Worklogs.

* Year and Month are custom dropdowns: click the Month box, click the month name (e.g. "September"). The table
  reloads; "No Data Found!" means nothing is logged that month.
* `get_page_text` returns the table as text, for example:

  ```
  PIN Resource Project 1 2 3 … 29 30 Σ
  1885 Md. Mubin Ul Islam Chowdhury Internal Service & RnD 0 0 0 … 6 6 12
  SELP Legal Compass (AI Chatbot) 0 0 … 6 … 0 0 6
  Σ Hours 0 0 0 … 6 … 6 6 18
  ```

  The numbers after "Σ Hours" are day 1, day 2, … in order; the last number is the month total. Hours are whole or
  decimal hours.
* Rule: if a day's Σ Hours is already ≥ 6, log nothing for it. If it is below 6, log only the difference in minutes.
* For dates in different months, read each month separately.

## Before and after

* Before adding, read the Monthly Timesheet totals as above (this replaces checking only `/my-un-billable-worklogs`,
  which misses project timesheet hours).
* After adding everything, re-read the Monthly Timesheet: every logged day must total exactly 6 and none may exceed
  it. Also confirm the new rows on `/my-un-billable-worklogs` (date, minutes, category, project).
* Rows can be edited or deleted from the pencil and bin icons in the Option column, but never delete anything unless
  the user asks.
