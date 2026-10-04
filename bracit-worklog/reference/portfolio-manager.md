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

## Before and after

* Before adding, open `/my-un-billable-worklogs` and read the table (`get_page_text`). If a row already has the same
  date and category, do not add another; report it as already logged.
* After adding everything, reload `/my-un-billable-worklogs` and confirm each date appears with the right minutes,
  category and project.
* Rows can be edited or deleted from the pencil and bin icons in the Option column, but never delete anything unless
  the user asks.
