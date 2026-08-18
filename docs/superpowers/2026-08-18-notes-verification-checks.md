# Workout notes — verification checklist

**Date:** 2026-08-18
**Branch:** `feat/weight-wheel-and-notes`
**Status:** automated verification complete (323 tests, typecheck, lint at baseline, build). Everything below needs the migration applied and a signed-in account.

## Why this list exists

`supabase/migrations/0010_notes.sql` was never applied while this was built — there is no local Postgres, and the schema lands via the Supabase GitHub integration on merge. So **no code path in this feature has ever touched a real `note` or `note_exercise` row.** Types, unit tests and careful reading are the only checks behind every query.

That makes item 1 below not a formality: it is the first time the repo layer runs at all.

---

## 1. The queries have never run — start here

Create a standalone note from **Notes → New note**, with a body and one tag.

- **Pass:** it saves, the sheet closes, and the note appears in the list with its chip.
- **What this actually tests:** `createNote`'s two writes, the `note_exercise` insert, `listNotes`' nested `note_exercise(exercise_id)` embed coming back in the shape `flattenNoteQuery` expects, and RLS admitting the query. Any of those being wrong shows up here first.
- **If you see a `PGRST200` on the very first request:** that is PostgREST's schema cache still catching up after the DDL. Wait a moment and retry before treating it as a bug.

## 2. The bug the editor structure exists to prevent

In a workout, expand an exercise → **＋ Note** → type a body → **Tag exercise** → dismiss the picker by tapping **its own backdrop** (not by picking anything).

- **Pass:** the picker closes and **your typed body is still there.**
- **Why:** the picker used to sit inside the editor's click-to-close backdrop, so dismissing it bubbled up and discarded the note. Two independent fixes now prevent that, but both were only ever proven in jsdom.
- **Also try:** start a text selection inside the textarea and release the drag **outside** the sheet. The note must survive that too — the click lands on the backdrop as the two nodes' common ancestor.

## 3. Session provenance survives what it was designed to survive

Write a note from inside a workout on exercise X. Then remove exercise X from that session (the ✕ on the exercise card, which only shows with no logged sets).

- **Pass:** the note still exists on the Notes page, still tagged with X.
- **Why it matters:** this is the whole reason provenance is a nullable `session_id` rather than `session_exercise_id` — those rows are hard-deleted on removal, which would have destroyed the anchor.

## 4. The filter cannot strand you

Filter by an exercise, then delete that filter's **only** note.

- **Pass:** the chip disappears, the filter resets to "All", and you see your other notes. You must never be stuck looking at an empty filtered list with no chip and no "All" to return to.
- **Same check via editing:** with a filter active, edit that filter's only note to remove the tag. Same expected outcome.
- **And the inverse:** if *other* notes still carry the tag, the filter must persist and only the edited note drop out.

## 5. Day grouping against real timestamps

Write a note late in the evening and another after midnight, then look at the Notes page.

- **Pass:** two separate day groups, correct headers, newest day first and newest note first within a day.
- **Why a device check:** grouping uses local calendar days. The unit tests are timezone-independent by construction, but they have never run against a real `created_at` written by Postgres.

## 6. Error handling is visible where it happens

With airplane mode on, try to delete a note far down the list.

- **Pass:** the error appears **on that row**, not only at the top of the page, and the note is still in the list afterwards — there is no optimistic removal, so the list stays truthful.
- Then try to save a note offline: the sheet must stay open with your text intact.

## 7. Layout at a phone width

At 390px: a long multi-paragraph body, and a note tagged with an exercise that has a very long custom name.

- **Pass:** line breaks preserved; an unbroken long string (a URL) wraps rather than widening the card; in the editor the chip's ✕ stays on screen no matter how long the name is.

## 8. Header title

The Notes page header shows "Notes", from `nav.notes` via `AppHeader`'s title map.

This was briefly a gap — `/notes` was the only route in the app missing from that map, leaving a back arrow with no title. It was justified at the time by pointing at `ExerciseProgressPage` and `ActiveWorkoutPage`, which also render their own `<h1>`; that reasoning was wrong, because both of those are *also* in the title map. They are precedent for having both, not for having neither. Fixed before merge.

## 9. The iOS keyboard vs the Save button — highest-value check here

In a workout, ＋ Note, let the software keyboard come up (the textarea autofocuses).

- **Pass:** you can reach **Save** without dismissing the keyboard.
- **Why it is in doubt:** the sheet is `mt-auto max-h-[85vh]` inside a `fixed inset-0` backdrop, and iOS does not shrink the layout viewport for the keyboard — a bottom-anchored fixed sheet stays put while the keyboard covers the lower ~40%. Save is the last element, the sheet's natural height is under `85vh` so `overflow-y-auto` gives no scroll room to recover, and `useBodyScrollLock` has pinned the page. `ExercisePickerSheet` survives the same shape only because its input is at the top and its list scrolls.
- **If it fails:** the sheet needs the keyboard handled (e.g. `env(keyboard-inset-height)`, or Save moved into the header row).

## 10. The nested double scroll lock, unwound on iOS

Note sheet → Tag exercise → close the picker → close the sheet.

- **Pass:** the page scrolls normally again afterwards.
- **Why:** this is the first place in the app that nests two `useBodyScrollLock`s. Unwinding is strictly LIFO and the reasoning checks out, but the hook is deliberately not refcounted, so if anything unmounts out of order `overflow: hidden` stays on the body permanently.

## 11. The sheet rendered from inside an accordion card

At 390px with an exercise expanded, open ＋ Note.

- **Pass:** the backdrop covers the whole viewport and nothing is clipped.
- **Why:** every other overlay in the workout screen is rendered at page top level; this is the only one nested inside a card (`relative overflow-hidden`). It should be fine — `overflow` never clips a `fixed` descendant — but it would break the day someone adds a `transform` to that card for an expand animation.

## 12. Save latency on a slow connection

Save a note from the Notes page on cellular.

- **Pass:** the "Saving…" hold is acceptable.
- **Why:** the Notes page awaits a full reload (all notes + all exercise names) before closing the sheet, where the workout entry point closes immediately. Two different contracts against the same component; this is the one that will feel slow.

---

## What to report back

Item 1 failing means the data layer needs work before anything else matters. Items 2–4 failing means a design assumption was wrong rather than a detail. Everything else is a fix.
