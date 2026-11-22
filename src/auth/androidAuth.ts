import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'

export const ANDROID_AUTH_CALLBACK = 'com.momentum.training://auth/callback'

export function listenForAndroidAuth() {
  if (Capacitor.getPlatform() !== 'android') return
  let handling = false
  function replaceRoute(path: string) {
    window.history.replaceState(window.history.state, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  async function finish({ url }: { url: string }) {
    const callback = new URL(url)
    if (`${callback.protocol}//${callback.host}${callback.pathname}` !== ANDROID_AUTH_CALLBACK || handling) return
    handling = true
    try {
      const code = callback.searchParams.get('code')
      if (!code) throw new Error('Missing authorization code')
      if (sessionStorage.getItem('momentum:android-auth-code') === code) return
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
      sessionStorage.setItem('momentum:android-auth-code', code)
      replaceRoute('/')
    } catch {
      replaceRoute('/login?auth_error=1')
    } finally {
      handling = false
    }
  }
  void App.addListener('appUrlOpen', finish).then(async () => {
    const launch = await App.getLaunchUrl()
    if (launch) await finish(launch)
  })
}

export async function signInOnAndroid() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: ANDROID_AUTH_CALLBACK, skipBrowserRedirect: true },
  })
  if (error) throw error
  await Browser.open({ url: data.url })
}
