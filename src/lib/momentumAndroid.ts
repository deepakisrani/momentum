import { Capacitor, registerPlugin } from '@capacitor/core'
import type { BodyMeasurement, HealthType, SleepSession } from '../data/healthRepo'

type HealthRecord = BodyMeasurement | SleepSession

export const isAndroid = Capacitor.getPlatform() === 'android'

export const momentumAndroid = registerPlugin<{
  status(): Promise<{ available: boolean; granted: HealthType[] }>
  requestHealthPermissions(): Promise<void>
  beginImport(options: { type: HealthType }): Promise<{ token: string }>
  readPage(options: { type: HealthType; start: string; end: string; pageToken?: string }):
    Promise<{ records: HealthRecord[]; nextPage: string | null }>
  readChanges(options: { token: string }):
    Promise<{ records: HealthRecord[]; deleted: string[]; token: string; more: boolean; expired: boolean }>
  saveCsv(options: { filename: string; text: string }): Promise<{ saved: boolean }>
}>('MomentumAndroid')
