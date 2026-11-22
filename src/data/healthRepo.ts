import { supabase } from '../lib/supabase'

export type BodyMetric = 'weight_kg' | 'body_fat_pct' | 'lean_mass_kg'
export type DailyMetric = 'steps' | 'resting_heart_rate'
export type HealthType = BodyMetric | 'sleep' | DailyMetric
export type DailyReading = { day: string; value: number }

export async function applyDailyHealth(userId: string, installation: string, type: DailyMetric,
  result: { firstDay: string; lastDay: string; readings: DailyReading[] },
) {
  const { error } = await supabase.rpc('apply_daily_health', {
    account: userId, installation, kind: type, first_day: result.firstDay,
    last_day: result.lastDay, readings: result.readings,
  })
  if (error) throw error
}

export interface BodyMeasurement {
  record_id: string
  source_package: string
  measured_at: string
  zone_offset_seconds: number | null
  value: number
}

export interface SleepSession {
  record_id: string
  source_package: string
  started_at: string
  ended_at: string
  start_offset_seconds: number | null
  end_offset_seconds: number | null
  stages: { start: string; end: string; type: number }[]
}

export async function applyHealthChanges(
  userId: string, installationId: string, type: HealthType,
  records: (BodyMeasurement | SleepSession)[], deleted: string[],
  complete: boolean,
  snapshot?: { start: string; end: string; ids: string[] },
) {
  const { error } = await supabase.rpc('apply_health_changes', {
    account: userId, installation: installationId, kind: type,
    records, deleted_ids: deleted, complete,
    ...(snapshot && { snapshot_start: snapshot.start, snapshot_end: snapshot.end, snapshot_ids: snapshot.ids }),
  })
  if (error) throw error
}

export async function getHealthSyncState(userId: string, installationId?: string) {
  const query = supabase.from('health_import_state')
    .select('record_type, synced_at').eq('user_id', userId).order('synced_at', { ascending: false })
  const { data, error } = await (installationId ? query.eq('installation_id', installationId) : query)
  if (error) throw error
  const latest = new Map<HealthType, { record_type: HealthType; synced_at: string }>()
  for (const row of (data ?? []) as { record_type: HealthType; synced_at: string }[]) {
    if (!latest.has(row.record_type)) latest.set(row.record_type, row)
  }
  return [...latest.values()]
}

export async function getDailyHealthData(userId: string, firstDay: string, lastDay: string) {
  // Source offsets can move a UTC timestamp to either neighboring calendar day.
  const from = new Date(Date.parse(firstDay) - 86_400_000).toISOString()
  const until = new Date(Date.parse(lastDay) + 2 * 86_400_000).toISOString()

  async function readPages<T>(read: (first: number, last: number) =>
    PromiseLike<{ data: T[] | null; error: unknown }>) {
    const items: T[] = []
    const pageSize = 500
    for (let first = 0; ; first += pageSize) {
      const { data, error } = await read(first, first + pageSize - 1)
      if (error) throw error
      if (data) items.push(...data)
      if (!data || data.length < pageSize) return items
    }
  }

  const [weights, body, sleep, daily] = await Promise.all([
    readPages<{ logged_on: string; weight_kg: number }>((first, last) =>
      supabase.from('daily_weight').select('logged_on, weight_kg').eq('user_id', userId)
        .gte('logged_on', firstDay).lte('logged_on', lastDay).order('logged_on').range(first, last)),
    readPages<BodyMeasurement & { metric: BodyMetric }>((first, last) =>
      supabase.from('body_measurement').select('record_id, source_package, measured_at, zone_offset_seconds, metric, value')
        .eq('user_id', userId).neq('metric', 'weight_kg').gte('measured_at', from).lt('measured_at', until)
        .order('measured_at').order('metric').order('record_id').range(first, last)),
    readPages<SleepSession>((first, last) =>
      supabase.from('sleep_session').select('record_id, source_package, started_at, ended_at, end_offset_seconds, start_offset_seconds, stages')
        .eq('user_id', userId).gte('ended_at', from).lt('ended_at', until)
        .order('ended_at').order('record_id').range(first, last)),
    readPages<DailyReading & { metric: DailyMetric }>((first, last) =>
      supabase.from('daily_health').select('day, metric, value').eq('user_id', userId)
        .gte('day', firstDay).lte('day', lastDay).order('day').order('metric').range(first, last)),
  ])
  return { weights, body, sleep, daily }
}
