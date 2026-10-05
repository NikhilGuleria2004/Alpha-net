import { createClient } from 'redis'
import { RedisStore } from 'rate-limit-redis'
import type { Store } from 'express-rate-limit'
import { logger } from './logger.js'

/**
 * Rate-limit store selection.
 *
 * The default express-rate-limit MemoryStore keeps counters in process memory.
 * That is correct for one long-lived server, but wrong for a horizontally
 * scaled one: every instance keeps its own counters, so N instances grant N
 * times the intended limit. On a serverless platform that is the difference
 * between a real brute-force control and no control at all — and it fails open,
 * silently.
 *
 * Set REDIS_URL to share counters across instances. Each limiter gets its own
 * key prefix so an email-keyed counter can never collide with an IP-keyed one.
 * Without REDIS_URL we still limit, but per instance, and we say so once at
 * boot rather than staying quiet about a weakened control.
 */
const stores = new Map<string, Store>()
let warnedAboutMemoryStore = false

export function getRateLimitStore(prefix: string): Store | undefined {
  const cached = stores.get(prefix)
  if (cached) return cached

  const url = (process.env.REDIS_URL || '').trim()
  if (!url) {
    if (!warnedAboutMemoryStore) {
      warnedAboutMemoryStore = true
      logger.warn(
        { prefix },
        'rate limiting uses per-instance in-memory counters; set REDIS_URL to share limits across instances',
      )
    }
    // undefined makes express-rate-limit fall back to its own MemoryStore.
    return undefined
  }

  const client = createClient({ url })
  // Without a listener a socket error would reject as an unhandled 'error'
  // event and take the whole function down rather than just this limiter.
  client.on('error', (err) => logger.error({ err, prefix }, 'rate-limit redis client error'))
  client.connect().catch((err) => logger.error({ err, prefix }, 'rate-limit redis connect failed'))

  const store = new RedisStore({
    sendCommand: (...args: string[]) => client.sendCommand(args),
    prefix,
  })
  stores.set(prefix, store)
  return store
}
