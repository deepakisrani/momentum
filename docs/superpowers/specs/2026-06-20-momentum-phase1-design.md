# Momentum — Phase 1 Design Spec

**Date:** 2026-06-20
**Status:** Approved for planning
**Phase:** 1 of 4 (Core tracker)

---

## 1. Overview

Momentum is an invite-only, installable PWA for hypertrophy-focused workout tracking. It replaces the author's Google Sheet workflow and fixes its two core limitations: it cannot record **different weights per set**, and it has **no way to log drop-sets**.

Phase 1 delivers everything needed to log a workout intelligently and know your energy baseline: Google login (invite-only), first-time onboarding with BMR/energy math, body-weight & goal logging, a full meso (mesocycle) builder, flexible workout logging with a session timer, and app-driven next-workout suggestions.

### Phasing context (for "don't paint ourselves into a corner")
- **Phase 1 — Core tracker (this spec).**
- **Phase 2 — Progress:** charts over time per exercise (volume, est. 1RM, per-muscle volume), using Phase 1's logged data.
- **Phase 3 — Nutrition & body:** food logging with an open food database, and the dynamic "calories you can eat today based on today's workout."
- **Phase 4 — Future:** bring-your-own LLM token for analysis; blood-report-adjusted recommendations.

The Phase 1 tech-stack decision carries through all later phases.

---

## 2. Goals & Non-Goals

### Goals (Phase 1)
- Invite-only Google authentication.
- First-time onboarding capturing the inputs needed for energy math and suggestions.
- Compute and display **BMR**, **maintenance (TDEE)**, and a **goal-adjusted daily calorie target**.
- Ongoing body-weight and goal logging (history-accurate).
- A meso-builder supporting the full structural model below.
- Flexible workout logging: per-set weights, drop-sets, optional RIR, a start/end session timer, non-linear day navigation, on-the-fly swap/add.
- App-driven progressive-overload suggestions.
- Deload handling (planned + ad-hoc, with carry-forward debt).

### Non-Goals (Phase 1 — deferred)
- Food logging and the dynamic workout-based calorie target (Phase 3).
- Progress charts/graphs (Phase 2).
- LLM integration, blood reports (Phase 4).
- An admin panel for invites or for promoting custom exercises to global (manual via DB for now).
- Pre-programmed weekly progression / RP-style volume landmarks (app-driven progression only).
- Account-level default scheduling style (chosen per meso every time).

---

## 3. Tech Stack

**Option A** (chosen, of three considered):

- **Frontend:** Vite + React + TypeScript + Tailwind, built as an installable **PWA** with **offline-capable logging** — set entries persist locally and sync when connectivity returns (gym signal is unreliable).
- **Backend/data:** **Supabase** — managed Postgres, Google OAuth (invite-only), Row-Level Security, file storage (reserved for Phase 4).
- **Business logic:** pure TypeScript modules with **zero Supabase imports**, behind a thin data-access layer, so the domain logic lifts cleanly into a custom backend later.
- **Charts:** Recharts (Phase 2).
- **Copy/i18n:** all UI text in a JSON dictionary (e.g. `strings/en.json`), referenced by key — no hard-coded strings in components. i18n-ready for future localization.

Rationale: fastest path for a solo developer on a stack already in use (the repo's yoga-studio is Vite + React + Tailwind), with multi-user security handled by RLS, and a clean path to public launch. The only meaningful lock-in (auth + DB hosting) is migratable.

---

## 4. Architecture

### Layering (enables portable logic)
1. **UI layer** — React components + Tailwind. No business rules; reads copy from the i18n dictionary.
2. **Domain layer** — pure TS modules (suggestion engine, energy math, scheduling/microcycle, units conversion). No I/O, no Supabase. Fully unit-testable.
3. **Data-access layer** — thin repository functions wrapping Supabase calls; the only place Supabase is imported. Returns plain domain objects.

The domain layer never imports the data or UI layers. This is what makes the logic "pick up and plop into a custom backend."

### Offline-first writes
Logging actions (start session, log set, end session) write to a local store first and queue a sync to Supabase. Reads hydrate from the server when online. Conflict policy for Phase 1: last-write-wins per record (single-user-per-account editing makes conflicts rare).

---

## 5. Data Model (Postgres, normalized / 3NF)

Exercise facts live only in `exercise` and are referenced by id — never duplicated into days or logs. Logs store **actuals** so past sessions are immutable even if the meso is later edited.

### Identity & body
```
profile (id→auth.users, display_name, sex, date_of_birth, height_cm,
         units_pref[metric|imperial], baseline_activity_level, created_at)

weight_log (id, user_id→profile, logged_on[date], weight_kg)
goal_log   (id, user_id→profile, effective_from[date], goal[cut|bulk|maintain])
```
- Current weight = latest `weight_log`; current goal = latest `goal_log`. Goal lives on the personal/body screen but is stored as a timestamped log so historical reporting knows which goal was active when.
- Storage is always metric; conversion happens at the UI edges per `units_pref`.

### Exercise library
```
exercise (id, owner_user_id[null = global/predefined], name,
          muscle_group, equipment, is_public[bool])
```
- Predefined exercises (`owner_user_id` null) are visible to all.
- Custom exercises are private to their creator; `is_public` can be flipped (manually now) to promote one to global.

### Meso (the plan)
```
meso (id, user_id, name, scheduling_style[calendar_week|continuous],
      deload_every_n_microcycles[int], is_active[bool], notes, created_at)

meso_day (id, meso_id→meso, label, order_index)

meso_day_exercise (id, meso_day_id→meso_day, exercise_id→exercise,
                   order_index, target_sets, rep_min, rep_max)
```
- Exactly one `meso` per user has `is_active = true`; it drives "today's session" and suggestions.
- `meso_day.label` is user-defined (e.g. "Push", "Leg Day Heavy").
- `rep_min == rep_max` represents a fixed rep target; otherwise a range.

### Microcycle (cycle tracking + deload)
```
microcycle (id, meso_id→meso, index, is_deload[bool],
            started_at, week_start_date[nullable, calendar mode], status)
```
- A microcycle = one full pass through the day-types (≈ a calendar week for calendar-week scheduling).
- Deload activates automatically every `deload_every_n_microcycles`.
- **Deload debt:** if a planned-deload microcycle is overridden (trained hard instead), the debt persists and the next microcycle prompts the user to deload.

### Logging (the truth — immutable)
```
workout_session (id, user_id, meso_id, microcycle_id, meso_day_id,
                 started_at, ended_at, is_deload[bool], status[in_progress|completed|skipped])

session_exercise (id, session_id→workout_session, exercise_id→exercise,
                  source[planned|swapped|added], order_index)

logged_set (id, session_exercise_id→session_exercise, set_index, is_drop_set[bool])

set_segment (id, logged_set_id→logged_set, segment_index, weight, reps, rir[nullable])
```
- **Per-set weights & drop-sets, unified:** a normal set has one `set_segment`; a drop-set has multiple ordered segments (e.g. 62.5→50→40). This single model handles both sheet pain points.
- `session_exercise.source` records whether an exercise was planned, swapped in, or added ad-hoc → powers honest meso-adherence reporting without corrupting per-exercise history.
- RIR is optional per segment.

### Access control
```
allowed_emails (email, invited_at)
```
- Invite-only: a Supabase auth hook / DB trigger rejects sign-in for any email not in `allowed_emails`.
- RLS on all user-owned tables: a user can read/write only their own rows; global exercises are readable by all.

---

## 6. Feature Modules

1. **Auth & invite** — Google OAuth via Supabase, gated by the `allowed_emails` allowlist.
2. **Onboarding** — first-run capture of sex, DOB, height, current weight, goal, baseline activity level, units; computes and shows BMR/TDEE/target.
3. **Profile & body metrics** — ongoing weight logging, goal changes, units; displays current BMR/TDEE/goal-adjusted target.
4. **Exercise library** — searchable, muscle-group-filterable list; add custom (private) exercises with tags.
5. **Meso-builder** — three launch pads (template / duplicate / blank); meso settings (name, scheduling style, deload cadence); custom-labelled day-types as tabs; per-day ordered, drag-reorderable exercise rows (`exercise · target sets · rep range`); add-exercise opens a muscle-filtered library sheet with a custom escape hatch; edit anytime (changes apply going forward); on-the-fly added exercises can be promoted into the active meso via a nudge.
6. **Active-session logging** — start/end timer; **day overview** with all exercises tappable in any order and done/in-progress/not-started markers; **swap** (per-session substitution) and **add** (ad-hoc) with same-muscle-group swap suggestions; **exercise detail** with a single "last time" reference line in sheet notation (`25 × (8, 8, 7) · avg RIR 2`), per-set weight/reps/optional-RIR, add/remove sets via a small icon, drop-set support; smart prefill (Set 1 = suggestion; later sets = last completed set; swapped exercises = empty); **deload toggle** with planned/ad-hoc + carry-forward debt.

---

## 7. Key Domain Logic (pure, unit-tested modules)

### Suggestion engine
`suggestForExercise(history, repRange, goal, isDeload) → { weight, repTarget }`
- Uses the most recent comparable sessions' logged sets + RIR to decide whether to push load/reps, hold, or (on deload) reduce.
- Higher RIR + bulk goal → more aggressive progression; cut goal → conservative (preserve strength in a deficit).
- Only Set 1 is suggested; later sets prefill from the just-completed set.
- Swapped/added exercises with no history return no suggestion (empty boxes).

### Energy math
- **BMR — Mifflin–St Jeor:**
  - Male: `10·kg + 6.25·cm − 5·age + 5`
  - Female: `10·kg + 6.25·cm − 5·age − 161`
- **TDEE** = `BMR × baseline_activity_factor` (workouts tracked separately; dynamic per-workout burn is Phase 3).
- **Goal-adjusted target** = TDEE with `−20%` (cut) / `+12%` (bulk) / `+0%` (maintain). Percentages tunable.

### Scheduling / microcycle
- **Calendar-week:** a fixed slate of sessions per calendar week; unfinished sessions are marked skipped at week rollover; a fresh full slate begins. Configurable week-start day.
- **Continuous rotation:** sessions form an ordered cycle that advances; nothing expires; "what's next" is the next unfinished session, missed ones staying at the front of the queue.
- Scheduling style is a **per-meso** setting (no account default).
- Microcycle rollover, deload activation (every N microcycles), and deload-debt carry-forward live here.

### Units conversion
Pure conversion helpers applied only at UI edges; storage is metric.

---

## 8. Cross-Cutting Concerns

- **Security:** invite allowlist at the DB; RLS per user on all owned tables; global exercises world-readable.
- **i18n:** every user-facing string comes from a JSON dictionary keyed by a stable id. No hard-coded copy in components.
- **Offline-first:** logging writes locally and syncs; last-write-wins for Phase 1.
- **Immutability of history:** logs store actuals; meso edits never rewrite past sessions.
- **Error handling:** failed syncs retry with backoff and surface a non-blocking "unsynced" indicator; auth failures (not invited) show a clear "request access" message.

---

## 9. Testing Strategy

- **TDD on the domain layer first** — suggestion engine, energy math, scheduling/microcycle, units conversion. These are where correctness matters most and have no I/O, so they're cheap to test exhaustively (incl. deload debt, calendar vs continuous rollover, drop-set aggregation, goal-driven suggestion branches).
- **Component/flow tests** for the logging flow (start → log sets incl. drop-set → end) and the meso-builder (create from each launch pad, edit, add/remove exercise).
- **Data-access layer** covered by focused integration tests against a Supabase test project (RLS enforcement, invite gating).

---

## 10. Open Items (intentionally deferred, tracked for later phases)

- First-screen ("New meso") copy is a later polish item.
- Exact tuning of suggestion aggressiveness and goal calorie percentages.
- Admin panel for invites and custom-exercise promotion (Phase 4-ish / public launch).
- Starter template content (which templates ship: PPL, Upper/Lower, Full Body, Arnold split).
