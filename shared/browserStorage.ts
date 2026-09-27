export const storageKeys = {
  dashboard: 'daydock_dashboard_v1',
  browser: 'daydock_activity_browser',
  excluded: 'daydock_activity_excluded'
} as const

type Key = keyof typeof storageKeys
type BrowserStorage = Pick<Storage, 'getItem' | 'removeItem'>

export function readBrowserStorage(storage: BrowserStorage, key: Key): string | null {
  return storage.getItem(storageKeys[key])
}

export function removeBrowserStorage(storage: BrowserStorage, key: Key) {
  storage.removeItem(storageKeys[key])
}
