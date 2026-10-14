# Time on task — Test plan

The admin dashboard shows how long each participant spent on their evaluations, from the start
of the 10-minute session to submission. No database change: every stored evaluation already
records its start and finish.

## Setup

- An admin account, and at least one participant with a completed evaluation.
- For a known value: complete an evaluation yourself and note roughly how long you took.

Pass criteria are in bold.

## A. Where it shows

| # | Step | Expected |
|---|------|----------|
| A1 | Sign in to `admin.html` | Participant table has a **Time** column (m:ss) before Last activity; Engagement has a fifth card **Time on task** with an average and "median m:ss · n evaluations". |
| A2 | Hover a Time cell for a participant with two completed evaluations | Tooltip reads **"2 completed evaluations · latest m:ss"**; the cell shows the **total**. |
| A3 | Click **Time** in the header | Sorts ascending (participants with no completed evaluation first, then shortest to longest); click again for descending, longest first. |
| A4 | Open a participant → Sessions | Each completed session line reads "Started … · Completed … · **Took m:ss**"; an unfinished session has no Took. |
| A5 | Export CSV | Columns **"Time Spent (m:ss)"** and **"Completed Evaluations"** present and filled. |

## B. Values

| # | Step | Expected |
|---|------|----------|
| B1 | Your own evaluation from Setup | Took m:ss **matches** what you noted, within a few seconds. |
| B2 | A participant who never finished | Time cell shows **—**; not counted in the card. |
| B3 | A pre-Sprint-4 evaluation (May 2026 rows, if any) | Shown as at most **11:00**, the server limit; the card is not skewed by it. |
| B4 | Archive a participant | Their time **leaves** the card's average and median; restore brings it back. |

## C. Regression

| # | Step | Expected |
|---|------|----------|
| C1 | All other columns, stats, charts, question bank, archive | Unchanged. |
| C2 | Phone width | Engagement cards wrap to two per row, then one; the table scrolls sideways. |
| C3 | Hard refresh on every page | No console errors; assets load with `?v=2.6`. |
