import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDirectory = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(appDirectory, process.env.NUXT_ACTIVITY_DIR || 'data/activity')
const args = process.argv.slice(2)
const wide = args.includes('--wide')
const positional = args.filter(arg => arg !== '--wide')
const days = Number(positional[0] || 30)
if (positional.length > 1 || !Number.isInteger(days) || days < 1 || days > 366) {
  console.error('Usage: node scripts/activity-report.mjs [days: 1–366] [--wide]')
  process.exit(1)
}
const cutoff = new Date()
cutoff.setUTCDate(cutoff.getUTCDate() - days + 1)
const from = cutoff.toISOString().slice(0, 10)
const to = new Date().toISOString().slice(0, 10)
let files
try { files = await readdir(directory) } catch (error) {
  if (error.code !== 'ENOENT') throw error
  console.log(`Activity directory not found: ${directory}`)
  console.log('No counts could be read here. Verify the storage path and volume; the directory is created on the first recorded event.')
  process.exit(0)
}
const keys = ['open', 'saved_open', 'customized_open', 'customized_actions', 'active', 'active_saved', 'bookmark_open', 'dashboard_edit', 'dashboard_switch', 'dashboard_export']
const totals = Object.fromEntries(keys.map(key => [key, 0]))
const rows = []
const browsers = new Map()
for (const file of files.sort()) {
  if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file) || file.slice(0, 10) < from || file.slice(0, 10) > to) continue
  const data = JSON.parse(await readFile(join(directory, file), 'utf8'))
  const counts = data.totals
  const row = { date: file.slice(0, 10) }
  for (const key of keys) {
    row[key] = counts[key] || 0
    totals[key] += row[key]
  }
  rows.push(row)
  for (const [id, activity] of Object.entries(data.browsers)) {
    let browser = browsers.get(id)
    if (!browser) {
      browser = { browser: id, last_state: 'unknown', customized_days: 0, customized_active_days: 0, active_days: 0, last_seen: '—', last_active: '—', ...Object.fromEntries(keys.map(key => [key, 0])) }
      browsers.set(id, browser)
    }
    for (const key of keys) browser[key] += activity[key] || 0
    browser.last_seen = file.slice(0, 10)
    if (activity.customization_state !== undefined) browser.last_state = activity.customization_state ? 'customized' : 'default'
    if (activity.customized_open || activity.customized_actions) browser.customized_days++
    if (activity.customized_actions) browser.customized_active_days++
    if (activity.active) {
      browser.active_days++
      browser.last_active = file.slice(0, 10)
    }
  }
}
const activeBrowsers = [...browsers.values()].filter(browser => browser.active > 0)
const customizedBrowsers = [...browsers.values()].filter(browser => browser.customized_days > 0)
const sortedBrowsers = [...browsers.values()].sort((a, b) => b.customized_days - a.customized_days || b.active - a.active)

if (!wide) {
  // Plain aligned text avoids console.table's index, quotes, and box padding.
  const table = (headings, values) => {
    const lines = [headings, ...values].map(row => row.map(String))
    const widths = headings.map((_, i) => Math.max(...lines.map(row => row[i].length)))
    for (const row of lines) console.log(row.map((value, i) =>
      /^\d+$/.test(value) ? value.padStart(widths[i]) : value.padEnd(widths[i])
    ).join('  ').trimEnd())
  }
  console.log(`Activity ${from} to ${to} (UTC)`)
  console.log(`Browsers: ${browsers.size} | Active: ${activeBrowsers.length} | Repeat active: ${activeBrowsers.filter(browser => browser.active_days > 1).length}`)
  console.log(`Customized: ${customizedBrowsers.length} | Repeat custom: ${customizedBrowsers.filter(browser => browser.customized_days > 1).length} | Used custom: ${customizedBrowsers.filter(browser => browser.customized_active_days > 0).length}`)
  console.log('\nDAILY')
  table(['Date', 'Opens', 'Active', 'Clicks', 'Edits', 'C.Act'], [...rows, { date: 'TOTAL', ...totals }].map(row =>
    [row.date, row.open, row.active, row.bookmark_open, row.dashboard_edit, row.customized_actions]
  ))
  console.log('\nBROWSERS (repeat customized usage first)')
  table(['ID', 'State', 'Days', 'C.Days', 'Opens', 'Clicks', 'Edits', 'Seen'], sortedBrowsers.map(browser =>
    [browser.browser.slice(0, 8), browser.last_state === 'customized' ? 'custom' : browser.last_state,
      browser.active_days, browser.customized_days, browser.open,
      browser.bookmark_open, browser.dashboard_edit, browser.last_seen]
  ))
  if (!browsers.size) console.log('No browser activity in this period.')
  console.log('\nDays = active days; C.Days = days seen customized; C.Act = custom actions.')
  console.log('Repeat = seen on 2+ qualifying days. State = last observed dashboard.')
  console.log('Browsers are not people. Use --wide for full IDs and all counters.')
  process.exit(0)
}

console.log(`Dashboard activity: ${from} through ${to} (UTC)`)
console.log(`Distinct browsers: ${browsers.size}; active browsers: ${activeBrowsers.length}; active on multiple days: ${activeBrowsers.filter(browser => browser.active_days > 1).length}`)
console.log(`Customized dashboards observed: ${customizedBrowsers.length}; customized on multiple days: ${customizedBrowsers.filter(browser => browser.customized_days > 1).length}; interacted while customized: ${customizedBrowsers.filter(browser => browser.customized_active_days > 0).length}`)
console.table([...rows, { date: 'TOTAL', ...totals }])
console.log('Activity by browser (repeat customized usage first):')
console.table(sortedBrowsers)
console.log('last_state = default/customized at the last received event; customized_days = days a customized dashboard was observed.')
console.log('active = loaded pages with an interaction; active_saved = those that loaded existing data.')
console.log('Action columns count events. Browser IDs persist across visits; separate devices or cleared storage count separately.')
console.log('Saved data may be unchanged defaults. Excluded browsers, blocked requests, and older open tabs are not measured.')
