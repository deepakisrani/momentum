import { useEffect, useState } from 'react'
import { getHealthSyncState, type HealthType } from '../../data/healthRepo'
import { isAndroid, momentumAndroid } from '../../lib/momentumAndroid'
import { healthInstallationId, syncHealthConnect } from './syncHealthConnect'

const labels: Record<HealthType, string> = {
  weight_kg: 'Weight', body_fat_pct: 'Body fat', lean_mass_kg: 'Lean body mass', sleep: 'Sleep',
  steps: 'Steps', resting_heart_rate: 'Resting heart rate',
}

export function HealthConnectSettings({ userId, onSynced }: { userId: string; onSynced: () => Promise<void> }) {
  const [installation] = useState(() => isAndroid ? healthInstallationId() : undefined)
  const [status, setStatus] = useState<Awaited<ReturnType<typeof momentumAndroid.status>> | null>(null)
  const [syncs, setSyncs] = useState<Awaited<ReturnType<typeof getHealthSyncState>>>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    if (isAndroid) void momentumAndroid.status().then((result) => {
      if (active) setStatus(result)
    }).catch(() => { if (active) setMessage('Could not check Health Connect access.') })
    void getHealthSyncState(userId, installation).then((result) => {
      if (active) setSyncs(result)
    }).catch(() => { if (active) setMessage('Could not load previous sync times.') })
    return () => { active = false }
  }, [userId, installation])

  async function run(connect: boolean) {
    if (!installation) return
    setBusy(true)
    setMessage('')
    try {
      if (connect) await momentumAndroid.requestHealthPermissions()
      const current = await momentumAndroid.status()
      setStatus(current)
      if (connect) return
      if (!current.granted.length) {
        setMessage('Grant access to at least one measurement before syncing.')
        return
      }
      const { failed, recovered } = await syncHealthConnect(userId, installation, current.granted)
      setSyncs(await getHealthSyncState(userId, installation))
      await onSynced()
      if (failed.length) setMessage(`Could not finish syncing ${failed.map((type) => labels[type]).join(', ')}. Try again.`)
      else if (recovered.length) setMessage('Recent records refreshed. Changes to older records may be missing.')
      else setMessage('Sync complete. Your scale or sleep app must write measurements to Health Connect for them to appear.')
    } catch {
      setMessage('Health Connect could not complete the request. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!isAndroid && !syncs.length) return null

  return (
    <section className="space-y-2 rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
      <h2 className="text-sm font-semibold">Health Connect</h2>
      {isAndroid && <p className="text-sm">Sync now copies the health data you allow to your Momentum account, including daily steps and resting heart rate when available.</p>}
      {status && !status.available && <p className="text-sm">Health Connect is unavailable. Check for an Android or Health Connect update.</p>}
      {status?.available && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void run(true)} className="rounded-lg bg-white px-3 py-2 text-sm dark:bg-[#0f1115]">
            {status.granted.length ? 'Request permissions' : 'Connect Health Connect'}
          </button>
          <button type="button" disabled={busy || !status.granted.length} onClick={() => void run(false)} className="rounded-lg bg-brand-700 px-3 py-2 text-sm text-white disabled:opacity-50">
            {busy ? 'Working…' : 'Sync now'}
          </button>
        </div>
      )}
      {!!status?.granted.length && <p className="text-xs">Read access granted for {status.granted.map((type) => labels[type]).join(', ')}.</p>}
      {syncs.length > 0 && <ul className="text-xs">{syncs.map((row) => (
        <li key={row.record_type}>{labels[row.record_type]} last synced {new Date(row.synced_at).toLocaleString()}</li>
      ))}</ul>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  )
}
