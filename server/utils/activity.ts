import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ActivityPayload } from '../../shared/activity'

// One Node process / replica. Serialize writes so simultaneous events aren't lost.
let writes = Promise.resolve()
let pending = 0

export function recordActivity(directory: string, payload: ActivityPayload) {
  if (pending >= 100) return Promise.reject(new Error('Activity writer busy'))
  const date = new Date().toISOString().slice(0, 10)
  pending++
  const write = writes.then(async () => {
    await mkdir(directory, { recursive: true })
    const file = join(directory, `${date}.json`)
    let data: { totals: Record<string, number>, browsers: Record<string, Record<string, number>> } = { totals: {}, browsers: {} }
    try {
      data = JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const browser = data.browsers[payload.browserId] ??= {}
    const increment = (key: string) => {
      data.totals[key] = (data.totals[key] || 0) + 1
      browser[key] = (browser[key] || 0) + 1
    }
    increment(payload.event)
    browser.customization_state = payload.customized ? 1 : 0
    if (payload.customized) increment(payload.event === 'open' ? 'customized_open' : 'customized_actions')
    if (payload.event === 'open' && payload.saved) increment('saved_open')
    if (payload.firstInteraction) {
      increment('active')
      if (payload.saved) increment('active_saved')
    }
    const temporary = `${file}.tmp`
    await writeFile(temporary, JSON.stringify(data) + '\n', { mode: 0o600 })
    await rename(temporary, file)
  })
  writes = write.catch(() => {}).finally(() => { pending-- })
  return write
}
