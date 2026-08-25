# Past-meso history and meso lifecycle — verification checklist

**Date:** 2026-08-25
**Branch:** `feat/meso-history-and-lifecycle`
**Status:** automated verification complete — 368 tests / 37 files, typecheck clean on a forced rebuild, lint exactly at the `main` baseline, build succeeds.

## Read this first: nothing here has run against a database

Migrations `0011` (meso `deleted_at` / `activated_at`) and `0012` (meso_day `deleted_at`) are
**unapplied**. They land when you merge, via the Supabase GitHub integration. So every query
added or changed on this branch — soft delete, the deleted-aware listings, the activation
window, `getMesoDayLabels`, `countCompletedSessions`, the unassigned bucket — has been verified
only by TypeScript and by reading. Not one of them has executed.

### Do not exercise this branch before the migrations apply

An earlier version of this document got this backwards in both directions. Corrected:

**Do not activate a meso on this branch at all — including "Resume Previous Run".** Every
activation path filters `.is('deleted_at', null)` on the target row, and PostgREST rejects a
filter on a column that does not exist just as it rejects an unknown column in a write. Because
`setActiveMeso` clears every `is_active` flag in a **separate request that commits first**, any
failed attempt leaves you with **no active meso** plus an error. Recoverable by re-activating
after the migrations land. Fresh run and resume fail identically; so does "Save & Activate", and
so does activating a meso you have never trained.

**What else is down pre-migration**, all for the same reason — a filter or write naming a column
that is not there yet:

| Surface | Pre-migration |
|---|---|
| Mesos page | Renders only its error; no button on it is reachable |
| Meso builder, workout day chooser | Down (`getMesoFull`) |
| Saving an edit to an existing meso | Fails |
| Deleting a meso | Fails |
| Workout page | Reads "Activate a meso first" |
| **History page, including CSV export** | **Works** |

**History does render**, contrary to what this document first claimed: its queries use
`select('*')` and never name the new columns. It simply never splits runs, because
`activated_at` comes back undefined and the window falls away. So the feature that motivated all
of this is the one thing you *can* look at early.

The reverse order is safe: applying the migrations before this code deploys breaks nothing, since
the old code selects `*`, ignores the extra columns, and its hard deletes are the pre-existing
bugs rather than new ones. **Confirm your pipeline applies migrations before serving the new
bundle** — that ordering is the single largest risk on this branch.

Everything below assumes the migrations have applied.

---

## Tier 1 — the reason this work exists

### 1. Export a past meso

History → switch to a meso that is **not** active → Export CSV.

- **Pass:** you get that meso's rows, with its name in the filename.
- **Why first:** this is the hole that nearly cost you real data. Before this change the export
  was locked to the active meso, so switching meso removed the ability to export what came
  before — you were saved only by a CSV you happened to have downloaded earlier.

### 2. Past mesos are readable at all

History → open the switcher.

- **Pass:** every meso is listed, newest first, and selecting one shows its sessions with their
  day labels.
- **Also:** the page defaults to your active meso. With no active meso it should default to the
  newest rather than showing an empty screen — the old page showed "No active mesocycle" in that
  state, which is what made an inactive meso's history invisible.

### 3. Deleting a meso keeps its history

Mesos → delete a meso that has logged sessions.

- **Pass:** it disappears from the Mesos page, **and remains in the History switcher** with its
  sessions and day labels intact.
- **Before:** delete hard-removed the row, which nulled `workout_session.meso_id` (orphaning the
  sessions) *and* cascaded `meso_day` away (destroying the labels). Both are now preserved.
- There is deliberately **no undelete**. Recovering one is a one-line DB update.

### 4. Removing a day keeps that day's history

Edit a meso that has logged sessions → remove a day → save. Then look at History.

- **Pass:** past sessions on that day still show their day name.
- **Why it matters:** this was a live bug on `main`, found during implementation and unrelated to
  deleting mesos. Removing a day hard-deleted the `meso_day` row, so every session ever logged
  on it lost its label, dropped out of the day-filtered "Previous workout" panel, and stopped
  counting toward the deload cadence.
- **A second effect of the same bug, also fixed:** the old hard delete cascaded that day's
  planned exercises away too. If you removed a day while a workout on it was in progress, every
  target silently fell back to 3 sets of 8–12 — wrong set counts, wrong "all sets done" prompt,
  no error. Worth a look if you can contrive it.

---

## Tier 2 — the activation window

### 5. Fresh run versus resume

Mesos → "Make active" on a meso that already has sessions.

- **Pass:** you get three choices — Start Fresh Run, Resume Previous Run, Cancel.
- **Resume:** the deload counter and "Previous workout" are exactly as they were.
- **Fresh run:** both are cleared. The day chooser shows no "Last workout" line, no deload
  badge, and the "Previous workout" sheet reads "No previous workout for this day yet."
- **Why three buttons:** two would break the case the dialog exists for. Four sessions into a
  block, an accidental switch away and back would leave you choosing between resetting your
  cadence and leaving the wrong meso active.

### 6. No dialog for an untrained meso

Activate a meso you have never trained.

- **Pass:** it activates immediately, no dialog. Nothing to preserve, so no question worth asking.

### 7. History splits runs after a fresh run

After a fresh run, look at that meso in History.

- **Pass:** two groups, "Current run" and "Earlier runs".
- **Known limit:** one timestamp cannot separate three or more runs — everything before the
  latest activation lands in "Earlier runs" together. Accepted when the column was chosen.

### 8. The cross-meso case — most likely to be wrong

Start a workout on meso A → go to Mesos → activate meso B → return to `/workout` and open
"Previous workout".

- **Pass:** you see **A's** sessions (unwindowed), not an empty sheet.
- **Why it is worth testing:** the panel is scoped to the in-progress session's meso, while the
  page knows only the *currently active* meso. Passing the active meso's window here would query
  A's sessions through B's window and show "No previous workout" for a day with months of
  history — indistinguishable from a failure, since the panel's error path also renders empty.
  There is an identity guard for exactly this; item 8 confirms it holds.

---

## Tier 3 — the rest

### 9. The unassigned bucket

- **Pass:** "Unassigned workouts" appears in the switcher **only** if you have sessions belonging
  to no meso (from a meso hard-deleted before this change, or a workout logged with no meso
  active). Its cards show **"—"** for the day label.
- That "—" is permanent for those sessions: their `meso_day_id` was nulled by the old cascade and
  the label rows are gone. Soft delete prevents it happening again; it cannot undo it.

### 10. Switching scope quickly

Switch between mesos rapidly.

- **Pass:** the list that settles matches the dropdown. (There is an `ignore` guard on the
  in-flight request; this is what confirms it.)

### 11. Error states keep the switcher usable

Go offline, then switch scope.

- **Pass:** the error replaces only the session list. The switcher stays usable so you can
  navigate out of the broken scope, and the export button stays clickable — if the list query
  fails, you keep the export path, which is the entire point of this feature.

### 12. Overlapping overlays no longer strand page scroll

With the delete confirmation open, Tab to "Make active" and press Enter, then close both in
either order.

- **Pass:** the page scrolls again afterwards.
- **Background:** `useBodyScrollLock` is now reference-counted. Previously each overlay saved and
  restored `overflow` independently, which was only correct in LIFO order — and the likely order
  here was the wrong one, leaving the page unscrollable until some other modal cycled. Seven
  components share that hook, so this hardens all of them.

### 13. Two mesos with the same name

If you delete a "Push/Pull" and build a new one, the switcher shows two identical entries,
distinguishable only by position (newest first), and both export to the same filename — the
second download gets the browser's "(1)" suffix.

- Deleted mesos carry no marker, by your choice — the row exists to group history. If the
  duplication ever annoys you, a date range per option would disambiguate without reintroducing
  a badge.

### 14. Title-case labels

Buttons across the app read as title case: **Start Workout**, **Resume Workout**, **Add Set**,
**New Meso**, **Make Active**, **Tag Exercise**.

- Prose is deliberately untouched: confirmations, hints, status text and headings stay sentence
  case. So the button "Previous Workout" opens a sheet headed "Previous workout", and the Notes
  button "New Note" opens a sheet headed "New note" — labels and headings follow different rules.

---

## Known and accepted

- **A half-typed height** during a unit switch converts and clamps (`17` on the way to `175`
  becomes `20`). Visible and correctable, unlike the silent corruption it replaced.
- **`activated_at` is client time**, not server time — PostgREST cannot evaluate `now()` in a
  PATCH body. The consequence was not "brief": the stamp never moves, so on a device running
  fast the session logged right after a fresh run would sit outside its own run *permanently* —
  missing from "Previous workout", uncounted by the deload cadence, and shown under "Earlier
  runs" ten minutes after you did it. The stamp is now backdated one minute, which closes it
  (the window only has to exclude sessions that are months old).
- **Remove a day and re-add one with the same name** and you get two rows. History labels both
  "Push", but the previous-workout panel filters on the *new* day's id, so pre-removal sessions
  stop surfacing there and that day's cadence restarts.
- **The dialog asks a consequence-free question** for a meso whose sessions all predate its own
  `activated_at` — fresh run and resume produce identical state. One extra tap in a rare state.
- **`dashboard.logWeight`** is a dead i18n key with no reader. Left in place; removing keys was
  out of scope.

## Added by the final review — not covered above

### 15. Saving an edit twice does not re-stamp a removed day

Edit a meso, remove a day, save. Then save again without changing anything.

- **Pass:** the second save neither re-stamps `deleted_at` on the already-removed day nor treats
  it as newly removed. The reconcile reads only live days, which is what prevents it — but that
  query has never run.

### 16. The stale-URL activation guard actually fires

Soft-delete a meso, then open `/mesos/<that-id>/edit` (the builder loads a deleted meso
deliberately) and press "Save & Activate".

- **Pass:** you get an error message. **Not** a silent no-op that leaves you with no active meso.
- This is the one query on the branch whose entire job is to fail; nothing else exercises it.

### 17. Three changes agreeing at once

With the activation dialog open on the Mesos page, Tab behind it (no modal here traps focus),
delete **that same meso** through the delete confirmation, then click "Start Fresh Run" on the
now-stale dialog.

- **Pass:** the error from check 16, not an activation — and page scroll works afterwards.
- Sharpest cross-strand interaction on the branch: the soft delete, the activation guard and the
  reference-counted scroll lock all have to be right simultaneously.

### 18. A day removed mid-workout keeps its targets

Start a workout on a day, then (another tab or device) edit that meso and remove that day. Back
in the workout, check the set targets.

- **Pass:** your planned sets and rep ranges are intact.
- **Why it matters more than it sounds:** this is the only place the day soft delete protects a
  *live* workout rather than a historical record. Before it, the hard delete cascaded the day's
  planned exercises away and every target silently fell back to 3 sets of 8–12 — so you would log
  a whole session against the wrong plan with no error anywhere.

### 19. A day label mid-workout after removing that day

Same setup as 18, but look at the "Previous workout" sheet header.

- **Known cosmetic gap:** the label resolves against live days only, so it renders blank and the
  header reads " · Aug 25". New surface created by keeping `meso_day_id` alive — which is the
  fix working. Not corrected; report if it bothers you.

## What to report back

Items 1–4 failing means a data path is wrong and matters immediately. Items 5–8 failing means
the activation window is misapplied. Everything else is polish.
