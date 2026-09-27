import type { ActivityEvent } from '~~/shared/activity'
import type { DashboardData } from '~~/shared/types'
import { isDashboardCustomized } from '~~/shared/customization'
import defaultDashboardData from '~~/public/data/items.json'
import { storageKeys, readBrowserStorage, removeBrowserStorage } from '~~/shared/browserStorage'

// A random first-party browser ID links usage across visits; no fingerprinting.
let ready = false
let hadSavedData = false
let day = ''
let interacted = false
const exclusionKey = storageKeys.excluded
const browserKey = storageKeys.browser

export function useActivity() {
  const config = useRuntimeConfig()

  function track(event: ActivityEvent) {
    if (import.meta.server || !ready || String(config.public.activityEnabled) !== 'true') return
    try {
      if (readBrowserStorage(localStorage, 'excluded') === '1' || navigator.doNotTrack === '1' ||
        (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return

      const today = new Date().toISOString().slice(0, 10)
      if (day !== today) {
        day = today
        interacted = false
      }
      let browserId = readBrowserStorage(localStorage, 'browser')
      if (!browserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(browserId)) {
        browserId = crypto.randomUUID()
        localStorage.setItem(browserKey, browserId)
      }
      const firstInteraction = event !== 'open' && !interacted
      const data = JSON.parse(readBrowserStorage(localStorage, 'dashboard') || 'null')
      if (!data) return
      const customized = isDashboardCustomized(data, defaultDashboardData as DashboardData)
      if (firstInteraction) interacted = true
      void fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browserId, event, saved: hadSavedData, customized, firstInteraction }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        keepalive: true
      }).catch(() => {})
    } catch {
      // Tracking must never interrupt the dashboard, including blocked storage.
    }
  }

  function start(saved: boolean) {
    if (import.meta.server || ready) return
    try {
      const preference = new URL(window.location.href).searchParams.get('activity')
      if (preference === 'off') localStorage.setItem(exclusionKey, '1')
      if (preference === 'on') removeBrowserStorage(localStorage, 'excluded')
    } catch { return }
    hadSavedData = saved
    ready = true
    track('open')
  }

  return { start, track }
}
