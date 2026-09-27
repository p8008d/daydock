import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
import { isDashboardCustomized } from '../shared/customization.ts'
import { storageKeys, readBrowserStorage, removeBrowserStorage } from '../shared/browserStorage.ts'

test('report finds app data when launched from the Docker terminal root directory', async () => {
  const app = await mkdtemp(join(tmpdir(), 'daydock-report-'))
  try {
    await mkdir(join(app, 'scripts'))
    await mkdir(join(app, 'data/activity'), { recursive: true })
    const script = join(app, 'scripts/activity-report.mjs')
    await copyFile('scripts/activity-report.mjs', script)
    const counts = { open: 1, active: 1, bookmark_open: 1 }
    await writeFile(join(app, 'data/activity', `${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify({
      totals: counts, browsers: { [webcrypto.randomUUID()]: counts }
    }))
    for (const configuredPath of [undefined, './data/activity', join(app, 'data/activity')]) {
      const env = { ...process.env }
      delete env.NUXT_ACTIVITY_DIR
      if (configuredPath !== undefined) env.NUXT_ACTIVITY_DIR = configuredPath
      const report = execFileSync(process.execPath, [script, '30'], { cwd: '/', env, encoding: 'utf8' })
      assert.match(report, /Browsers: 1 \| Active: 1/)
      assert.ok(report.split('\n').every(line => line.length <= 80), 'Compact report fits an 80-column terminal')
      const wide = execFileSync(process.execPath, [script, '30', '--wide'], { cwd: '/', env, encoding: 'utf8' })
      assert.match(wide, /Distinct browsers: 1; active browsers: 1/)
    }
  } finally {
    await rm(app, { recursive: true, force: true })
  }
})

async function browser(url = 'https://daydock.example/', enabled = true) {
  const values = new Map()
  const events = []
  const defaults = { activeDashboard: 'one', dashboards: [{ id: 'one', name: 'One', categories: [] }] }
  const context = vm.createContext({
    URL, Date, crypto: webcrypto, console: { error() {} },
    window: { location: { href: url } },
    navigator: {},
    isDashboardCustomized,
    storageKeys, readBrowserStorage, removeBrowserStorage,
    defaultDashboardData: defaults,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    useRuntimeConfig: () => ({ public: { activityEnabled: enabled } }),
    ref: value => ({ value }),
    fetch: async (url, options) => {
      if (options) events.push(JSON.parse(options.body))
      return { ok: true, json: async () => structuredClone(defaults) }
    }
  })
  for (const file of ['useActivity', 'useStorage']) {
    const source = await readFile(`app/composables/${file}.ts`, 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    vm.runInContext(js.replaceAll('import.meta.server', 'false').replace(/^export /gm, '').replace(/^import .*;$/gm, ''), context)
  }
  return { context, values, events, run: source => vm.runInContext(source, context) }
}

test('existing Daydock data and browser exclusion survive initialization', async () => {
  const b = await browser()
  const dashboard = { activeDashboard: 'personal', dashboards: [{ id: 'personal', name: 'My saved board', categories: [] }] }
  const browserId = webcrypto.randomUUID()
  b.values.set(storageKeys.dashboard, JSON.stringify(dashboard))
  b.values.set(storageKeys.browser, browserId)
  b.values.set(storageKeys.excluded, '1')
  await b.run('var storage = useStorage(); storage.init()')
  assert.equal(b.run('storage.getActiveDashboard().name'), 'My saved board')
  assert.deepEqual(JSON.parse(b.values.get(storageKeys.dashboard)), dashboard)
  b.run('useActivity().start(true)')
  assert.equal(b.events.length, 0)
  assert.equal(readBrowserStorage(b.context.localStorage, 'browser'), browserId)
  removeBrowserStorage(b.context.localStorage, 'dashboard')
  assert.equal(b.values.has(storageKeys.dashboard), false)
})

test('initialization and unchanged saves are not activity; successful edits are', async () => {
  const b = await browser()
  await b.run('var storage = useStorage(); storage.init()')
  assert.equal(b.events.length, 0)
  b.run('var activity = useActivity(); activity.start(false)')
  b.run("storage.setActiveDashboard('one')")
  assert.equal(b.events.length, 1)
  b.run("storage.addCategory('Personal')")
  b.run("storage.addCategory('Another')")
  b.run("activity.track('bookmark_open'); activity.track('bookmark_open')")
  assert.deepEqual(b.events.map(({ browserId, ...event }) => event), [
    { event: 'open', saved: false, customized: false, firstInteraction: false },
    { event: 'dashboard_edit', saved: false, customized: true, firstInteraction: true },
    { event: 'dashboard_edit', saved: false, customized: true, firstInteraction: false },
    { event: 'bookmark_open', saved: false, customized: true, firstInteraction: false },
    { event: 'bookmark_open', saved: false, customized: true, firstInteraction: false }
  ])
  assert.equal(new Set(b.events.map(event => event.browserId)).size, 1)
  assert.equal(b.values.get('daydock_activity_browser'), b.events[0].browserId)
  await b.run('storage.resetAll()')
  assert.equal(b.events.at(-1).customized, false)
})

test('customization recognizes content and ordering changes but ignores active tab and IDs', async () => {
  const defaults = JSON.parse(await readFile('public/data/items.json', 'utf8'))
  const data = structuredClone(defaults)
  data.activeDashboard = 'trading'
  data.dashboards[0].id = 'new-id'
  data.dashboards[0].categories[0].items[0].id = 'new-item-id'
  assert.equal(isDashboardCustomized(data, defaults), false)
  for (const change of [
    value => { value.dashboards[0].name = 'Personal' },
    value => { value.dashboards[0].categories[0].items[0].url = 'https://personal.example/' },
    value => { value.dashboards[0].categories.reverse() },
    value => { value.dashboards[0].categories[0].items.reverse() },
    value => { value.dashboards[0].wallpaper.value = 'custom-wallpaper' },
    value => { value.dashboards.pop() }
  ]) {
    const changed = structuredClone(defaults)
    change(changed)
    assert.equal(isDashboardCustomized(changed, defaults), true)
  }
  assert.equal(isDashboardCustomized(structuredClone(defaults), defaults), false)
})

test('existing data is flagged and tracking failure cannot break successful saves', async () => {
  const b = await browser()
  await b.run('var storage = useStorage(); storage.init()')
  b.run('useActivity().start(!!storage.getData())')
  assert.equal(b.events[0].saved, true)
  b.context.fetch = () => Promise.reject(new Error('offline'))
  assert.ok(b.run("storage.addCategory('Offline')"))
  await new Promise(resolve => setImmediate(resolve))
})

test('opt-out, disabled tracking, privacy preferences and failed saves emit no interactions', async () => {
  for (const mode of ['optout', 'disabled', 'dnt', 'gpc', 'failed-save']) {
    const b = await browser(mode === 'optout' ? 'https://daydock.example/?activity=off' : undefined, mode !== 'disabled')
    await b.run('var storage = useStorage(); storage.init()')
    if (mode === 'dnt') b.context.navigator.doNotTrack = '1'
    if (mode === 'gpc') b.context.navigator.globalPrivacyControl = true
    b.run('useActivity().start(true)')
    if (mode === 'failed-save') b.context.localStorage.setItem = () => { throw new Error('quota') }
    b.run("storage.addCategory('Test')")
    assert.equal(b.events.filter(event => event.event !== 'open').length, 0, mode)
    if (mode !== 'failed-save') assert.equal(b.events.length, 0, mode)
    if (mode === 'optout') assert.equal(b.values.get('daydock_activity_excluded'), '1')
  }
})

async function startServer(directory, enabled) {
  const env = { ...process.env, HOST: '127.0.0.1', PORT: '0', NITRO_PORT: '0', NUXT_ACTIVITY_DIR: directory }
  delete env.NUXT_PUBLIC_ACTIVITY_ENABLED
  if (enabled !== undefined) env.NUXT_PUBLIC_ACTIVITY_ENABLED = String(enabled)
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timeout')) }, 10000)
    let output = ''
    child.stderr.on('data', data => { output += data })
    child.stdout.on('data', data => {
      output += data
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match) { clearTimeout(timer); resolve(match[0]) }
    })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}\n${output}`)) })
  })
  return { origin, stop: async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill()
    await once(child, 'exit')
  } }
}

test('production endpoint validates events, persists concurrent counts across restarts, and reports privately', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daydock-activity-'))
  let server
  try {
    server = await startServer(directory)
    const post = (body, origin = server.origin) => fetch(`${server.origin}/api/activity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body)
    })
    assert.equal((await fetch(server.origin)).status, 200)
    const payload = { browserId: webcrypto.randomUUID(), event: 'bookmark_open', saved: true, customized: true, firstInteraction: true }
    for (const body of [null, {}, { ...payload, event: 'unknown' }, { ...payload, url: 'private-bookmark' }, { ...payload, event: 'open' }]) {
      assert.equal((await post(body)).status, 400)
    }
    assert.equal((await post(payload, 'https://another.example')).status, 403)
    assert.equal((await post({ ...payload, padding: 'x'.repeat(300) })).status, 413)
    const responses = await Promise.all(Array.from({ length: 12 }, () => post(payload)))
    assert.ok(responses.every(response => response.status === 204))
    await server.stop()
    server = await startServer(directory)
    assert.equal((await post(payload)).status, 204)
    const counts = JSON.parse(await readFile(join(directory, `${new Date().toISOString().slice(0, 10)}.json`), 'utf8'))
    assert.deepEqual(counts.totals, { bookmark_open: 13, customized_actions: 13, active: 13, active_saved: 13 })
    assert.deepEqual(counts.browsers[payload.browserId], { ...counts.totals, customization_state: 1 })
    const secondId = webcrypto.randomUUID()
    assert.equal((await post({ ...payload, browserId: secondId, customized: false })).status, 204)
    assert.equal((await post({ ...payload, event: 'dashboard_edit', customized: false, firstInteraction: false })).status, 204)
    const updated = JSON.parse(await readFile(join(directory, `${new Date().toISOString().slice(0, 10)}.json`), 'utf8'))
    assert.equal(updated.browsers[payload.browserId].customization_state, 0)
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    await writeFile(join(directory, `${yesterday.toISOString().slice(0, 10)}.json`), JSON.stringify({
      totals: { open: 1, customized_open: 1 },
      browsers: { [payload.browserId]: { open: 1, customized_open: 1, customization_state: 1 } }
    }))
    const report = execFileSync(process.execPath, ['scripts/activity-report.mjs', '30', '--wide'], {
      env: { ...process.env, NUXT_ACTIVITY_DIR: directory }, encoding: 'utf8'
    })
    assert.match(report, /TOTAL/)
    assert.match(report, /13/)
    assert.match(report, /Distinct browsers: 2; active browsers: 2/)
    assert.match(report, /Customized dashboards observed: 1; customized on multiple days: 1; interacted while customized: 1/)
    await server.stop()
    server = await startServer(directory, false)
    assert.equal((await post(payload)).status, 404)
  } finally {
    if (server) await server.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
