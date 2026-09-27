import { activityEvents, type ActivityPayload } from '../../shared/activity'
import { recordActivity } from '../utils/activity'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig(event)
  if (String(config.public.activityEnabled) !== 'true') {
    throw createError({ statusCode: 404 })
  }
  // Discourage cross-site submissions; this is a public counter, not proof of humanity.
  const origin = getHeader(event, 'origin')
  let sameHost = false
  try { sameHost = !!origin && new URL(origin).host === getHeader(event, 'host') } catch {}
  if (!sameHost || (getHeader(event, 'sec-fetch-site') && getHeader(event, 'sec-fetch-site') !== 'same-origin')) {
    throw createError({ statusCode: 403 })
  }
  if (getHeader(event, 'content-type')?.split(';')[0] !== 'application/json') {
    throw createError({ statusCode: 415 })
  }
  // Enforce a small body limit even for chunked requests.
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of event.node.req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 256) throw createError({ statusCode: 413 })
    chunks.push(buffer)
  }
  let body: ActivityPayload
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw createError({ statusCode: 400 })
  }
  if (!body || typeof body !== 'object' || Object.keys(body).sort().join(',') !== 'browserId,customized,event,firstInteraction,saved' ||
    typeof body.browserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.browserId) ||
    !activityEvents.includes(body.event) || typeof body.saved !== 'boolean' || typeof body.customized !== 'boolean' ||
    typeof body.firstInteraction !== 'boolean' || (body.event === 'open' && body.firstInteraction)) {
    throw createError({ statusCode: 400 })
  }
  try {
    await recordActivity(config.activityDir, body)
  } catch {
    console.error('[activity] Unable to persist activity counts; check volume permissions and disk space.')
    throw createError({ statusCode: 503, statusMessage: 'Activity storage unavailable' })
  }
  setResponseStatus(event, 204)
  return null
})
