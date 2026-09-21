import { supabase } from '../lib/supabase'
import type { WorkoutSessionRow, SessionExerciseRow, LoggedSetRow, SetSegmentRow } from './rows'
import type { SetResult } from '../domain/types'
import { sessionsSinceLastDeload } from '../domain/scheduling'

export interface SessionExerciseFull extends SessionExerciseRow {
  sets: (LoggedSetRow & { segments: SetSegmentRow[] })[]
}
export interface SessionFull {
  session: WorkoutSessionRow
  exercises: SessionExerciseFull[]
}

export async function getActiveSession(userId: string): Promise<WorkoutSessionRow | null> {
  const { data, error } = await supabase
    .from('workout_session').select('*')
    .eq('user_id', userId).eq('status', 'in_progress')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as WorkoutSessionRow | null
}

/** Starts a session for a meso day, pre-creating planned session_exercise rows from the meso plan. */
export async function startSession(
  userId: string,
  opts: { mesoId: string | null; mesoDayId: string | null; isDeload: boolean },
): Promise<string> {
  const { data, error } = await supabase
    .from('workout_session')
    .insert({ user_id: userId, meso_id: opts.mesoId, meso_day_id: opts.mesoDayId, is_deload: opts.isDeload, status: 'in_progress' })
    .select('id').single()
  if (error) throw error
  const sessionId = data.id as string
  if (opts.mesoDayId) {
    const { data: planned, error: pe } = await supabase
      .from('meso_day_exercise').select('exercise_id, order_index').eq('meso_day_id', opts.mesoDayId).order('order_index', { ascending: true })
    if (pe) throw pe
    if (planned && planned.length) {
      const rows = planned.map((p) => ({ session_id: sessionId, exercise_id: p.exercise_id, source: 'planned' as const, order_index: p.order_index }))
      const { error: se } = await supabase.from('session_exercise').insert(rows)
      if (se) throw se
    }
  }
  return sessionId
}

export async function getSessionFull(sessionId: string): Promise<SessionFull> {
  const { data: session, error: e1 } = await supabase.from('workout_session').select('*').eq('id', sessionId).single()
  if (e1) throw e1
  const { data: ses, error: e2 } = await supabase
    .from('session_exercise').select('*').eq('session_id', sessionId).order('order_index', { ascending: true })
  if (e2) throw e2
  const seIds = (ses ?? []).map((s) => s.id)
  let sets: LoggedSetRow[] = []
  let segments: SetSegmentRow[] = []
  if (seIds.length) {
    const { data: ls, error: e3 } = await supabase.from('logged_set').select('*').in('session_exercise_id', seIds).order('set_index', { ascending: true })
    if (e3) throw e3
    sets = (ls ?? []) as LoggedSetRow[]
    const lsIds = sets.map((s) => s.id)
    if (lsIds.length) {
      const { data: segs, error: e4 } = await supabase.from('set_segment').select('*').in('logged_set_id', lsIds).order('segment_index', { ascending: true })
      if (e4) throw e4
      segments = (segs ?? []) as SetSegmentRow[]
    }
  }
  return {
    session: session as WorkoutSessionRow,
    exercises: ((ses ?? []) as SessionExerciseRow[]).map((se) => ({
      ...se,
      sets: sets.filter((s) => s.session_exercise_id === se.id).map((s) => ({ ...s, segments: segments.filter((g) => g.logged_set_id === s.id) })),
    })),
  }
}

/** Adds a single-segment set (v1 has no drop-sets). */
export async function addSet(sessionExerciseId: string, setIndex: number, seg: { weight: number; reps: number; rir: number | null }): Promise<void> {
  const { data, error } = await supabase
    .from('logged_set').insert({ session_exercise_id: sessionExerciseId, set_index: setIndex, is_drop_set: false }).select('id').single()
  if (error) throw error
  const { error: se } = await supabase
    .from('set_segment').insert({ logged_set_id: data.id, segment_index: 0, weight: seg.weight, reps: seg.reps, rir: seg.rir })
  if (se) throw se
}

export async function updateSegment(segmentId: string, seg: { weight: number; reps: number; rir: number | null }): Promise<void> {
  const { error } = await supabase.from('set_segment').update(seg).eq('id', segmentId)
  if (error) throw error
}

export async function deleteSet(loggedSetId: string): Promise<void> {
  const { error } = await supabase.from('logged_set').delete().eq('id', loggedSetId)
  if (error) throw error
}

export async function addSessionExercise(sessionId: string, exerciseId: string, orderIndex: number, source: 'added' | 'swapped' = 'added'): Promise<void> {
  const { error } = await supabase.from('session_exercise').insert({ session_id: sessionId, exercise_id: exerciseId, source, order_index: orderIndex })
  if (error) throw error
}

/** Removes an exercise from a session (logged sets/segments cascade-delete). */
export async function removeSessionExercise(sessionExerciseId: string): Promise<void> {
  const { error } = await supabase.from('session_exercise').delete().eq('id', sessionExerciseId)
  if (error) throw error
}

export async function setSessionDeload(sessionId: string, isDeload: boolean): Promise<void> {
  const { error } = await supabase.from('workout_session').update({ is_deload: isDeload }).eq('id', sessionId)
  if (error) throw error
}

export async function endSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_session').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', sessionId)
  if (error) throw error
}


export interface MesoDayStat {
  lastDate: string | null
  sinceLastDeload: number
}

/** Per meso_day: most recent completed-session date + sessions since the last actual deload.
 *
 * `since` is the meso's `activated_at`. It matters most for the deload count: without it,
 * re-activating a meso abandoned four sessions past its last deload immediately reports
 * "Deload scheduled" on the strength of months-old sessions. */
export async function getMesoDayStats(userId: string, mesoId: string, since?: string | null): Promise<Record<string, MesoDayStat>> {
  let q = supabase
    .from('workout_session')
    .select('meso_day_id, started_at, ended_at, is_deload')
    .eq('user_id', userId)
    .eq('meso_id', mesoId)
    .eq('status', 'completed')
    .not('meso_day_id', 'is', null)
    .order('started_at', { ascending: false })
  if (since) q = q.gte('started_at', since)
  const { data, error } = await q
  if (error) throw error
  const byDay: Record<string, { isDeload: boolean }[]> = {}
  const lastDate: Record<string, string> = {}
  for (const r of (data ?? []) as { meso_day_id: string; started_at: string; ended_at: string | null; is_deload: boolean }[]) {
    if (!byDay[r.meso_day_id]) { byDay[r.meso_day_id] = []; lastDate[r.meso_day_id] = r.ended_at ?? r.started_at }
    byDay[r.meso_day_id].push({ isDeload: r.is_deload })
  }
  const out: Record<string, MesoDayStat> = {}
  for (const dayId of Object.keys(byDay)) {
    out[dayId] = { lastDate: lastDate[dayId] ?? null, sinceLastDeload: sessionsSinceLastDeload(byDay[dayId]) }
  }
  return out
}

/** Most recent prior COMPLETED, NON-deload session's sets for an exercise (first segment of each set), for "last time" + suggestions. Deloads are excluded so suggestions build off real working weights. */
export async function getLastPerformance(userId: string, exerciseId: string, excludeSessionId: string): Promise<SetResult[] | null> {
  const { data: ws, error } = await supabase
    .from('workout_session')
    .select('id, session_exercise!inner(id, exercise_id)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .eq('is_deload', false)
    .neq('id', excludeSessionId)
    .eq('session_exercise.exercise_id', exerciseId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const se = (ws?.session_exercise as { id: string; exercise_id: string }[] | undefined)?.[0]
  if (!se) return null
  const { data: ls, error: e2 } = await supabase
    .from('logged_set').select('id').eq('session_exercise_id', se.id).order('set_index', { ascending: true })
  if (e2) throw e2
  const lsIds = (ls ?? []).map((r) => r.id)
  if (!lsIds.length) return null
  const { data: segs, error: e3 } = await supabase
    .from('set_segment').select('*').in('logged_set_id', lsIds).eq('segment_index', 0)
  if (e3) throw e3
  const bySet: Record<string, SetSegmentRow> = {}
  for (const s of (segs ?? []) as SetSegmentRow[]) bySet[s.logged_set_id] = s
  return lsIds.map((id) => bySet[id]).filter(Boolean).map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir }))
}

export interface SessionSummary {
  id: string
  meso_day_id: string | null
  started_at: string
  ended_at: string | null
  is_deload: boolean
  exerciseCount: number
}

export interface SessionCursor {
  startedAt: string
  id: string
}

export interface SessionPage {
  sessions: SessionSummary[]
  nextCursor: SessionCursor | null
}

function mapSessionSummaries(data: unknown[]): SessionSummary[] {
  type Raw = { id: string; meso_day_id: string | null; started_at: string; ended_at: string | null; is_deload: boolean; session_exercise: { count: number }[] }
  return (data as Raw[]).map((r) => ({
    id: r.id,
    meso_day_id: r.meso_day_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    is_deload: r.is_deload,
    exerciseCount: Number(r.session_exercise?.[0]?.count ?? 0),
  }))
}

/** One stable, newest-first History page. The cursor is the final row's sort tuple, so new
 * completed workouts cannot shift, skip, or duplicate rows in a later page. */
export async function getMesoSessionPage(
  userId: string,
  mesoId: string | null,
  pageSize: number,
  cursor?: SessionCursor | null,
): Promise<SessionPage> {
  let q = supabase
    .from('workout_session')
    .select('id, meso_day_id, started_at, ended_at, is_deload, session_exercise(count)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1)
  q = mesoId === null ? q.is('meso_id', null) : q.eq('meso_id', mesoId)
  if (cursor) {
    // `(started_at, id) < cursor` expressed in PostgREST's filter grammar.
    q = q.or(`started_at.lt.${cursor.startedAt},and(started_at.eq.${cursor.startedAt},id.lt.${cursor.id})`)
  }
  const { data, error } = await q
  if (error) throw error
  const all = mapSessionSummaries((data ?? []) as unknown[])
  const hasMore = all.length > pageSize
  const sessions = hasMore ? all.slice(0, pageSize) : all
  const final = sessions.length ? sessions[sessions.length - 1] : undefined
  return {
    sessions,
    nextCursor: hasMore && final ? { startedAt: final.started_at, id: final.id } : null,
  }
}

/** Completed sessions, newest first.
 *
 * `mesoId: null` is the "unassigned" bucket -- sessions whose meso was hard-deleted before
 * soft delete existed, or which were logged while no meso was active. They are otherwise
 * unreachable in the app.
 *
 * `since` is the activation window: pass a meso's `activated_at` to see only its current
 * run. History deliberately passes nothing, so it can show every run.
 *
 * The `if (opts?.since)` guard must stay conditional. postgrest-js interpolates the value
 * straight into the filter, so `.gte('started_at', null)` sends `started_at=gte.null`, and
 * PostgREST only reads `null` as SQL NULL for the `is` operator -- every other operator
 * binds the four characters as an unknown-typed literal, which Postgres then fails to cast
 * to timestamptz (400, "invalid input syntax"). An unconditional `.gte` would therefore
 * break the previous-workout panel for every meso that has never been re-activated.
 * Truthiness, not `!= null`, so an empty string is skipped too. */
export async function listMesoSessions(
  userId: string,
  mesoId: string | null,
  opts?: { mesoDayId?: string; since?: string | null },
): Promise<SessionSummary[]> {
  let q = supabase
    .from('workout_session')
    .select('id, meso_day_id, started_at, ended_at, is_deload, session_exercise(count)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
  q = mesoId === null ? q.is('meso_id', null) : q.eq('meso_id', mesoId)
  if (opts?.mesoDayId) q = q.eq('meso_day_id', opts.mesoDayId)
  if (opts?.since) q = q.gte('started_at', opts.since)
  const { data, error } = await q
  if (error) throw error
  return mapSessionSummaries((data ?? []) as unknown[])
}

/** How many completed sessions belong to a meso -- or to no meso at all when `mesoId` is
 * null. Two callers: History asks about null to decide whether to offer an "Unassigned"
 * entry, and the Mesos page asks about a meso to decide whether activating it needs the
 * fresh-run/resume question at all (a meso nobody has trained has nothing to preserve).
 *
 * `head: true` makes this a HEAD request, so no rows cross the wire; the count arrives in
 * the Content-Range header. It is an RLS-scoped count -- PostgREST builds it from the same
 * read plan, so it can never see rows the user cannot read. */
export async function countCompletedSessions(userId: string, mesoId: string | null): Promise<number> {
  let q = supabase
    .from('workout_session')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
  q = mesoId === null ? q.is('meso_id', null) : q.eq('meso_id', mesoId)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}
