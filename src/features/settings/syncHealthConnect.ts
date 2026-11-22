import { applyDailyHealth, applyHealthChanges, getHealthSyncState, type HealthType } from '../../data/healthRepo'
import { momentumAndroid } from '../../lib/momentumAndroid'

export function healthInstallationId() {
  const key = 'momentum:health-installation'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

let inFlight = false

export async function syncHealthConnect(userId: string, installation: string, types: HealthType[]) {
  if (inFlight) throw new Error('Health Connect sync is already running')
  inFlight = true
  try {
    const state = await getHealthSyncState(userId, installation)
    const failed: HealthType[] = []
    const recovered: HealthType[] = []
    for (const type of types) {
      try {
        if (type === 'steps' || type === 'heart_rate') {
          await applyDailyHealth(userId, installation, type, await momentumAndroid.readDailyHealth({ type }))
          continue
        }
        if (await syncType(userId, installation, type, state.some((row) => row.record_type === type))) {
          recovered.push(type)
        }
      } catch {
        failed.push(type)
      }
    }
    return { failed, recovered }
  } finally {
    inFlight = false
  }
}

async function syncType(userId: string, installation: string, type: HealthType, previouslySynced: boolean) {
  const key = `momentum:health:${userId}:${installation}:${type}`
  let token = previouslySynced ? localStorage.getItem(key) : null
  let recovered = previouslySynced && !token

  // Take the token before the snapshot, so edits made during paging are replayed afterward.
  // Stay inside the default history window. Older records already imported remain available.
  async function snapshot() {
    const initial = await momentumAndroid.beginImport({ type })
    const now = Date.now()
    const end = new Date(now).toISOString()
    const start = new Date(now - 29 * 86_400_000).toISOString()
    const ids: string[] = []
    let pageToken: string | undefined
    do {
      const page = await momentumAndroid.readPage({
        type, start, end, pageToken,
      })
      if (page.records.length) await applyHealthChanges(userId, installation, type, page.records, [], false)
      for (const record of page.records) ids.push(record.record_id)
      pageToken = page.nextPage ?? undefined
    } while (pageToken)
    await applyHealthChanges(userId, installation, type, [], [], false, { start, end, ids })
    return initial.token
  }

  token ??= await snapshot()
  for (;;) {
    const page = await momentumAndroid.readChanges({ token })
    if (page.expired) {
      if (recovered) throw new Error('Health Connect change token expired again')
      recovered = true
      token = await snapshot()
      continue
    }
    await applyHealthChanges(userId, installation, type, page.records, page.deleted, !page.more)
    token = page.token
    localStorage.setItem(key, token)
    if (!page.more) return recovered
  }
}
