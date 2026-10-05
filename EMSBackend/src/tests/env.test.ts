import { describe, it, expect, afterEach } from 'vitest'
import { validateEnv } from '../lib/env.js'

/**
 * Deployment-guard behaviour for validateEnv.
 *
 * The production CORS requirement exists because a deployed API that falls back
 * to the localhost default rejects every real browser request while still
 * answering curl and health checks — an outage with nothing in the logs to
 * explain it. That failure mode is invisible without a test pinning it.
 */
describe('validateEnv', () => {
  const KEYS = ['NODE_ENV', 'MONGODB_URI', 'MONGODB_DB_NAME', 'JWT_SECRET', 'CORS_ORIGINS', 'CRON_SECRET'] as const
  const saved = new Map<string, string | undefined>(KEYS.map((key) => [key, process.env[key]]))

  afterEach(() => {
    for (const key of KEYS) {
      const original = saved.get(key)
      if (original === undefined) delete process.env[key]
      else process.env[key] = original
    }
  })

  function baseEnv() {
    process.env.MONGODB_URI = 'mongodb+srv://cluster.example.net/db'
    process.env.MONGODB_DB_NAME = 'alphanet'
    process.env.JWT_SECRET = 'a-real-secret'
  }

  it('accepts a production config that declares an origin allowlist', () => {
    process.env.NODE_ENV = 'production'
    baseEnv()
    process.env.CORS_ORIGINS = 'https://app.example.com'
    expect(() => validateEnv()).not.toThrow()
  })

  it('fails a production deploy with no CORS allowlist rather than serving only localhost', () => {
    process.env.NODE_ENV = 'production'
    baseEnv()
    delete process.env.CORS_ORIGINS
    expect(() => validateEnv()).toThrow(/CORS_ORIGINS/)
  })

  it('treats a blank CORS allowlist as missing in production', () => {
    process.env.NODE_ENV = 'production'
    baseEnv()
    process.env.CORS_ORIGINS = '   '
    expect(() => validateEnv()).toThrow(/CORS_ORIGINS/)
  })

  it('does not require CORS_ORIGINS outside production, where the dev default applies', () => {
    process.env.NODE_ENV = 'development'
    baseEnv()
    delete process.env.CORS_ORIGINS
    expect(() => validateEnv()).not.toThrow()
  })

  it('no longer requires CRON_SECRET: the session-cleanup cron was removed as redundant', () => {
    // sessions carry a TTL index (collections.ts), so MongoDB reaps expired
    // documents on its own and the scheduled cleanup had nothing left to do.
    process.env.NODE_ENV = 'production'
    baseEnv()
    process.env.CORS_ORIGINS = 'https://app.example.com'
    delete process.env.CRON_SECRET
    expect(() => validateEnv()).not.toThrow()
  })

  it('still fails on a genuinely missing core variable', () => {
    process.env.NODE_ENV = 'development'
    baseEnv()
    delete process.env.JWT_SECRET
    expect(() => validateEnv()).toThrow(/JWT_SECRET/)
  })
})
