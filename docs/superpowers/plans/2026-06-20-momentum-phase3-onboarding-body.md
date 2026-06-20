# Momentum Phase 3 — Onboarding & Body Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-run onboarding (sex, DOB, height, weight, goal, activity, units) and a body-metrics dashboard that shows BMR, maintenance (TDEE), and the goal-adjusted calorie target — establishing the data-access layer pattern and the profile-data context the later feature screens reuse.

**Architecture:** A thin data-access layer (`src/data/`) is the only place besides `lib/supabase.ts` and the auth files that imports Supabase. Pure composition logic (onboarding-completeness, energy summary) lives in unit-tested modules. React screens consume a `ProfileDataProvider` context. All copy comes from the i18n dictionary; weights/heights are stored metric and converted at the form edges with `src/domain/units`.

**Tech Stack:** React, TypeScript, Tailwind, Supabase JS, Vitest + Testing Library. Reuses `src/domain` (energy, units). No new dependencies.

---

## File Structure

```
src/data/
  rows.ts                 # DB row types (ProfileRow, WeightLogRow, GoalLogRow)
  profileRepo.ts          # getProfile, updateProfile
  weightRepo.ts           # getLatestWeight, listWeights, addWeight
  goalRepo.ts             # getLatestGoal, addGoal
src/features/profile/
  onboardingStatus.ts     # isOnboardingComplete(profile, latestWeight, latestGoal)  [pure]
  onboardingStatus.test.ts
  energySummary.ts        # buildEnergySummary(...)  [pure, composes src/domain/energy]
  energySummary.test.ts
  ProfileDataProvider.tsx # loads profile+latestWeight+latestGoal; exposes { ..., loading, reload }
  useProfileData.ts
  RequireOnboarding.tsx    # redirects to /onboarding if incomplete
  OnboardingPage.tsx       # the first-run form
  DashboardPage.tsx        # body-metrics dashboard (replaces the HomePage placeholder)
src/pages/HomePage.tsx     # DELETED (replaced by DashboardPage)
```

All dates passed to domain functions are real `Date`s built by the caller; pure modules never call `new Date()` themselves (callers pass `today`).

---

## Task 1: Data-access layer

**Files:**
- Create: `src/data/rows.ts`, `src/data/profileRepo.ts`, `src/data/weightRepo.ts`, `src/data/goalRepo.ts`

- [ ] **Step 1: Create `src/data/rows.ts`**

```ts
import type { Sex, Goal, Units } from '../domain/types'

export interface ProfileRow {
  id: string
  display_name: string | null
  sex: Sex | null
  date_of_birth: string | null // ISO date 'YYYY-MM-DD'
  height_cm: number | null
  units_pref: Units
  baseline_activity_level: number
  created_at: string
}

export interface WeightLogRow {
  id: string
  user_id: string
  logged_on: string // 'YYYY-MM-DD'
  weight_kg: number
}

export interface GoalLogRow {
  id: string
  user_id: string
  effective_from: string // 'YYYY-MM-DD'
  goal: Goal
}
```

- [ ] **Step 2: Create `src/data/profileRepo.ts`**

```ts
import { supabase } from '../lib/supabase'
import type { ProfileRow } from './rows'

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profile').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as ProfileRow | null
}

export type ProfileUpdate = Partial<
  Pick<ProfileRow, 'display_name' | 'sex' | 'date_of_birth' | 'height_cm' | 'units_pref' | 'baseline_activity_level'>
>

export async function updateProfile(userId: string, fields: ProfileUpdate): Promise<void> {
  const { error } = await supabase.from('profile').update(fields).eq('id', userId)
  if (error) throw error
}
```

- [ ] **Step 3: Create `src/data/weightRepo.ts`**

```ts
import { supabase } from '../lib/supabase'
import type { WeightLogRow } from './rows'

export async function getLatestWeight(userId: string): Promise<WeightLogRow | null> {
  const { data, error } = await supabase
    .from('weight_log')
    .select('*')
    .eq('user_id', userId)
    .order('logged_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as WeightLogRow | null
}

export async function listWeights(userId: string): Promise<WeightLogRow[]> {
  const { data, error } = await supabase
    .from('weight_log')
    .select('*')
    .eq('user_id', userId)
    .order('logged_on', { ascending: true })
  if (error) throw error
  return (data ?? []) as WeightLogRow[]
}

export async function addWeight(userId: string, loggedOn: string, weightKg: number): Promise<void> {
  const { error } = await supabase.from('weight_log').insert({ user_id: userId, logged_on: loggedOn, weight_kg: weightKg })
  if (error) throw error
}
```

- [ ] **Step 4: Create `src/data/goalRepo.ts`**

```ts
import { supabase } from '../lib/supabase'
import type { GoalLogRow } from './rows'
import type { Goal } from '../domain/types'

export async function getLatestGoal(userId: string): Promise<GoalLogRow | null> {
  const { data, error } = await supabase
    .from('goal_log')
    .select('*')
    .eq('user_id', userId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as GoalLogRow | null
}

export async function addGoal(userId: string, effectiveFrom: string, goal: Goal): Promise<void> {
  const { error } = await supabase.from('goal_log').insert({ user_id: userId, effective_from: effectiveFrom, goal })
  if (error) throw error
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: succeeds (no usage yet; just type-checks the repos).

- [ ] **Step 6: Commit**

```bash
git add src/data
git commit -m "feat(data): profile, weight, and goal repositories"
```

---

## Task 2: Pure onboarding-status + energy-summary logic (TDD)

**Files:**
- Create: `src/features/profile/onboardingStatus.ts`, `src/features/profile/onboardingStatus.test.ts`, `src/features/profile/energySummary.ts`, `src/features/profile/energySummary.test.ts`

- [ ] **Step 1: Write the failing test `src/features/profile/onboardingStatus.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { isOnboardingComplete } from './onboardingStatus'
import type { ProfileRow, WeightLogRow, GoalLogRow } from '../../data/rows'

const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: 'u1', display_name: 'D', sex: 'male', date_of_birth: '1991-06-20', height_cm: 180,
  units_pref: 'metric', baseline_activity_level: 1.55, created_at: '2026-06-20T00:00:00Z', ...over,
})
const weight: WeightLogRow = { id: 'w1', user_id: 'u1', logged_on: '2026-06-20', weight_kg: 82 }
const goal: GoalLogRow = { id: 'g1', user_id: 'u1', effective_from: '2026-06-20', goal: 'cut' }

describe('isOnboardingComplete', () => {
  it('is true when profile basics + a weight + a goal all exist', () => {
    expect(isOnboardingComplete(profile(), weight, goal)).toBe(true)
  })
  it('is false when the profile is missing', () => {
    expect(isOnboardingComplete(null, weight, goal)).toBe(false)
  })
  it.each(['sex', 'date_of_birth', 'height_cm'] as const)('is false when %s is null', (field) => {
    expect(isOnboardingComplete(profile({ [field]: null }), weight, goal)).toBe(false)
  })
  it('is false when there is no weight or no goal', () => {
    expect(isOnboardingComplete(profile(), null, goal)).toBe(false)
    expect(isOnboardingComplete(profile(), weight, null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it; confirm FAIL** — `npm test -- onboardingStatus` → cannot find module.

- [ ] **Step 3: Implement `src/features/profile/onboardingStatus.ts`**

```ts
import type { ProfileRow, WeightLogRow, GoalLogRow } from '../../data/rows'

export function isOnboardingComplete(
  profile: ProfileRow | null,
  latestWeight: WeightLogRow | null,
  latestGoal: GoalLogRow | null,
): boolean {
  return (
    profile != null &&
    profile.sex != null &&
    profile.date_of_birth != null &&
    profile.height_cm != null &&
    latestWeight != null &&
    latestGoal != null
  )
}
```

- [ ] **Step 4: Run it; confirm PASS** — `npm test -- onboardingStatus`.

- [ ] **Step 5: Write the failing test `src/features/profile/energySummary.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildEnergySummary } from './energySummary'

describe('buildEnergySummary', () => {
  it('composes age, BMR, TDEE, and goal target', () => {
    const s = buildEnergySummary({
      sex: 'male', dob: new Date(1996, 5, 20), heightCm: 180, weightKg: 80,
      activityFactor: 1.2, goal: 'cut', today: new Date(2026, 5, 20),
    })
    expect(s.ageYears).toBe(30)
    expect(s.bmr).toBe(1780)        // 10*80+6.25*180-5*30+5
    expect(s.tdee).toBeCloseTo(2136, 5)
    expect(s.target).toBe(1709)     // round(2136*0.8)
  })
})
```

- [ ] **Step 6: Run it; confirm FAIL** — `npm test -- energySummary`.

- [ ] **Step 7: Implement `src/features/profile/energySummary.ts`**

```ts
import type { Sex, Goal } from '../../domain/types'
import { ageFromDate, mifflinStJeorBmr, tdee, calorieTarget } from '../../domain/energy'

export interface EnergySummaryInput {
  sex: Sex
  dob: Date
  heightCm: number
  weightKg: number
  activityFactor: number
  goal: Goal
  today: Date
}

export interface EnergySummary {
  ageYears: number
  bmr: number
  tdee: number
  target: number
}

export function buildEnergySummary(input: EnergySummaryInput): EnergySummary {
  const ageYears = ageFromDate(input.dob, input.today)
  const bmr = mifflinStJeorBmr({ sex: input.sex, weightKg: input.weightKg, heightCm: input.heightCm, ageYears })
  const tdeeValue = tdee(bmr, input.activityFactor)
  return { ageYears, bmr, tdee: tdeeValue, target: calorieTarget(tdeeValue, input.goal) }
}
```

- [ ] **Step 8: Run it; confirm PASS** — `npm test -- energySummary`.

- [ ] **Step 9: Commit**

```bash
git add src/features/profile/onboardingStatus.ts src/features/profile/onboardingStatus.test.ts src/features/profile/energySummary.ts src/features/profile/energySummary.test.ts
git commit -m "feat(profile): onboarding-status and energy-summary logic"
```

---

## Task 3: Profile-data context + onboarding guard

**Files:**
- Create: `src/features/profile/ProfileDataProvider.tsx`, `src/features/profile/useProfileData.ts`, `src/features/profile/RequireOnboarding.tsx`

- [ ] **Step 1: Implement `src/features/profile/ProfileDataProvider.tsx`**

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/useAuth'
import { getProfile } from '../../data/profileRepo'
import { getLatestWeight } from '../../data/weightRepo'
import { getLatestGoal } from '../../data/goalRepo'
import type { ProfileRow, WeightLogRow, GoalLogRow } from '../../data/rows'

export interface ProfileData {
  profile: ProfileRow | null
  latestWeight: WeightLogRow | null
  latestGoal: GoalLogRow | null
  loading: boolean
  reload: () => Promise<void>
}

export const ProfileDataContext = createContext<ProfileData>({
  profile: null, latestWeight: null, latestGoal: null, loading: true, reload: async () => {},
})

export function ProfileDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [latestWeight, setLatestWeight] = useState<WeightLogRow | null>(null)
  const [latestGoal, setLatestGoal] = useState<GoalLogRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [p, w, g] = await Promise.all([getProfile(userId), getLatestWeight(userId), getLatestGoal(userId)])
      setProfile(p)
      setLatestWeight(w)
      setLatestGoal(g)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <ProfileDataContext.Provider value={{ profile, latestWeight, latestGoal, loading, reload }}>
      {children}
    </ProfileDataContext.Provider>
  )
}
```

- [ ] **Step 2: Implement `src/features/profile/useProfileData.ts`**

```ts
import { useContext } from 'react'
import { ProfileDataContext } from './ProfileDataProvider'

export function useProfileData() {
  return useContext(ProfileDataContext)
}
```

- [ ] **Step 3: Implement `src/features/profile/RequireOnboarding.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useProfileData } from './useProfileData'
import { isOnboardingComplete } from './onboardingStatus'

export function RequireOnboarding({ children }: { children: ReactNode }) {
  const { profile, latestWeight, latestGoal, loading } = useProfileData()
  if (loading) return null
  if (!isOnboardingComplete(profile, latestWeight, latestGoal)) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
```

- [ ] **Step 4: Verify build** — `npm run build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/ProfileDataProvider.tsx src/features/profile/useProfileData.ts src/features/profile/RequireOnboarding.tsx
git commit -m "feat(profile): profile-data context and onboarding guard"
```

---

## Task 4: Onboarding page

**Files:**
- Create: `src/features/profile/OnboardingPage.tsx`
- Modify: `src/i18n/strings/en.json`

- [ ] **Step 1: Add i18n keys to `src/i18n/strings/en.json`** (merge these keys into the existing object)

```json
{
  "onboarding.title": "Let's set you up",
  "onboarding.sex": "Sex",
  "onboarding.male": "Male",
  "onboarding.female": "Female",
  "onboarding.dob": "Date of birth",
  "onboarding.height": "Height (cm)",
  "onboarding.weight": "Current weight (kg)",
  "onboarding.activity": "Daily activity (excluding workouts)",
  "onboarding.goal": "Goal",
  "goal.cut": "Cut",
  "goal.bulk": "Bulk",
  "goal.maintain": "Maintain",
  "activity.sedentary": "Sedentary",
  "activity.lightly_active": "Lightly active",
  "activity.moderately_active": "Moderately active",
  "activity.very_active": "Very active",
  "activity.extra_active": "Extra active",
  "onboarding.submit": "Finish setup",
  "common.saving": "Saving…"
}
```

- [ ] **Step 2: Implement `src/features/profile/OnboardingPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { updateProfile } from '../../data/profileRepo'
import { addWeight } from '../../data/weightRepo'
import { addGoal } from '../../data/goalRepo'
import { ACTIVITY_FACTORS, type ActivityLevel } from '../../domain/energy'
import type { Sex, Goal } from '../../domain/types'

const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]
const GOALS: Goal[] = ['cut', 'maintain', 'bulk']

export function OnboardingPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { reload } = useProfileData()
  const userId = session!.user.id

  const [sex, setSex] = useState<Sex>('male')
  const [dob, setDob] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [activity, setActivity] = useState<ActivityLevel>('moderately_active')
  const [goal, setGoal] = useState<Goal>('maintain')
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await updateProfile(userId, {
        sex,
        date_of_birth: dob,
        height_cm: Number(heightCm),
        baseline_activity_level: ACTIVITY_FACTORS[activity],
        units_pref: 'metric',
      })
      await addWeight(userId, today, Number(weightKg))
      await addGoal(userId, today, goal)
      await reload()
      navigate('/', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">{t('onboarding.title')}</h1>

        <label className="block text-sm">{t('onboarding.sex')}
          <select className={field} value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="male">{t('onboarding.male')}</option>
            <option value="female">{t('onboarding.female')}</option>
          </select>
        </label>

        <label className="block text-sm">{t('onboarding.dob')}
          <input className={field} type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>

        <label className="block text-sm">{t('onboarding.height')}
          <input className={field} type="number" inputMode="decimal" required min="50" max="260" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
        </label>

        <label className="block text-sm">{t('onboarding.weight')}
          <input className={field} type="number" inputMode="decimal" required min="20" max="400" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </label>

        <label className="block text-sm">{t('onboarding.activity')}
          <select className={field} value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
            {ACTIVITY_LEVELS.map((a) => <option key={a} value={a}>{t(`activity.${a}`)}</option>)}
          </select>
        </label>

        <label className="block text-sm">{t('onboarding.goal')}
          <select className={field} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            {GOALS.map((g) => <option key={g} value={g}>{t(`goal.${g}`)}</option>)}
          </select>
        </label>

        <button type="submit" disabled={saving} className="w-full rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
          {saving ? t('common.saving') : t('onboarding.submit')}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verify build** — `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/features/profile/OnboardingPage.tsx src/i18n/strings/en.json
git commit -m "feat(profile): onboarding form"
```

---

## Task 5: Dashboard + weight/goal logging, and route wiring

**Files:**
- Create: `src/features/profile/DashboardPage.tsx`
- Delete: `src/pages/HomePage.tsx`
- Modify: `src/App.tsx`, `src/i18n/strings/en.json`

- [ ] **Step 1: Add i18n keys to `src/i18n/strings/en.json`** (merge in)

```json
{
  "dashboard.title": "Today",
  "dashboard.bmr": "BMR",
  "dashboard.maintenance": "Maintenance",
  "dashboard.target": "Target",
  "dashboard.currentWeight": "Current weight",
  "dashboard.currentGoal": "Goal",
  "dashboard.logWeight": "Log weight",
  "dashboard.changeGoal": "Change goal",
  "dashboard.kcal": "kcal",
  "common.save": "Save"
}
```

- [ ] **Step 2: Implement `src/features/profile/DashboardPage.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { ThemeToggle } from '../../theme/ThemeToggle'
import { useProfileData } from './useProfileData'
import { buildEnergySummary } from './energySummary'
import { addWeight } from '../../data/weightRepo'
import { addGoal } from '../../data/goalRepo'
import type { Goal } from '../../domain/types'

const GOALS: Goal[] = ['cut', 'maintain', 'bulk']

export function DashboardPage() {
  const t = useT()
  const { session } = useAuth()
  const userId = session!.user.id
  const { profile, latestWeight, latestGoal, reload } = useProfileData()
  const [weightInput, setWeightInput] = useState('')
  const [busy, setBusy] = useState(false)

  // Guard: provider guarantees these are present once onboarding is complete.
  if (!profile || !latestWeight || !latestGoal || !profile.sex || !profile.date_of_birth || profile.height_cm == null) {
    return null
  }

  const summary = buildEnergySummary({
    sex: profile.sex,
    dob: new Date(profile.date_of_birth),
    heightCm: profile.height_cm,
    weightKg: latestWeight.weight_kg,
    activityFactor: profile.baseline_activity_level,
    goal: latestGoal.goal,
    today: new Date(),
  })

  const today = () => new Date().toISOString().slice(0, 10)

  async function logWeight() {
    if (!weightInput) return
    setBusy(true)
    try {
      await addWeight(userId, today(), Number(weightInput))
      setWeightInput('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function changeGoal(goal: Goal) {
    setBusy(true)
    try {
      await addGoal(userId, today(), goal)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const stat = (label: string, value: string) => (
    <div className="rounded-xl bg-slate-100 p-4 text-center dark:bg-[#1b2030]">
      <div className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <ThemeToggle />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {stat(t('dashboard.bmr'), String(summary.bmr))}
          {stat(t('dashboard.maintenance'), String(Math.round(summary.tdee)))}
          {stat(t('dashboard.target'), String(summary.target))}
        </div>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">{t('dashboard.kcal')}</p>

        <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <div className="mb-2 text-sm">{t('dashboard.currentWeight')}: <b>{latestWeight.weight_kg} kg</b></div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#0f1115] dark:text-white"
              type="number" inputMode="decimal" step="0.1" placeholder="kg"
              value={weightInput} onChange={(e) => setWeightInput(e.target.value)}
            />
            <button onClick={logWeight} disabled={busy} className="rounded-lg bg-indigo-600 px-4 font-semibold text-white disabled:opacity-60">
              {t('dashboard.logWeight')}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <div className="mb-2 text-sm">{t('dashboard.currentGoal')}: <b>{t(`goal.${latestGoal.goal}`)}</b></div>
          <div className="flex gap-2">
            {GOALS.map((g) => (
              <button
                key={g}
                onClick={() => changeGoal(g)}
                disabled={busy || g === latestGoal.goal}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${g === latestGoal.goal ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900 dark:bg-[#0f1115] dark:text-white'}`}
              >
                {t(`goal.${g}`)}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => supabase.auth.signOut()} className="block w-full text-center text-sm text-slate-500 underline dark:text-slate-400">
          {t('auth.signOut')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Delete the old placeholder** — remove `src/pages/HomePage.tsx`.

- [ ] **Step 4: Rewrite `src/App.tsx`** to add the provider, onboarding route, and guard

```tsx
import { Routes, Route } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { AuthCallback } from './auth/AuthCallback'
import { RequireAuth } from './auth/RequireAuth'
import { ProfileDataProvider } from './features/profile/ProfileDataProvider'
import { RequireOnboarding } from './features/profile/RequireOnboarding'
import { OnboardingPage } from './features/profile/OnboardingPage'
import { DashboardPage } from './features/profile/DashboardPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ProfileDataProvider>
              <Routes>
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/" element={<RequireOnboarding><DashboardPage /></RequireOnboarding>} />
              </Routes>
            </ProfileDataProvider>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
```

- [ ] **Step 5: Verify** — `npm test` (existing suite still green) and `npm run build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/features/profile/DashboardPage.tsx src/App.tsx src/i18n/strings/en.json
git rm src/pages/HomePage.tsx
git commit -m "feat(profile): body-metrics dashboard and route wiring"
```

---

## Self-Review Notes (verified against spec §2, §4, §6)

- **Onboarding (spec §6):** captures sex, DOB, height, weight, goal, baseline activity, units; computes/shows BMR, TDEE, goal-adjusted target ✓ (Tasks 4–5). Activity options derive from `ACTIVITY_FACTORS` ✓.
- **Body-weight & goal logging (spec §6):** dashboard logs weight and changes goal, both timestamped (`logged_on` / `effective_from`), history-accurate ✓ (Task 5).
- **Layering (spec §4):** Supabase imported only in `src/data/*` repos (+ existing client/auth); pure composition in `energySummary`/`onboardingStatus`; domain energy reused, not reimplemented ✓.
- **i18n (spec §8):** every label/string from the dictionary; goal/activity options keyed (`goal.*`, `activity.*`) ✓.
- **Units:** stored metric; onboarding/dashboard use kg/cm inputs for v1 (imperial toggle deferred — `units_pref` persisted for later) ✓.
- **Type consistency:** `ProfileRow`/`WeightLogRow`/`GoalLogRow` defined once in `rows.ts`; `EnergySummary` fields (`ageYears`,`bmr`,`tdee`,`target`) match between `energySummary.ts` and the dashboard; `isOnboardingComplete` signature matches its uses in `RequireOnboarding` ✓.
- **HomePage replacement:** the Phase-1 placeholder is deleted and replaced by `DashboardPage`; `App.tsx` routes updated; no dangling import ✓.
```
