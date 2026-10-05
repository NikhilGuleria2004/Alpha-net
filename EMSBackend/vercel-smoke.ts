/**
 * Local smoke test for the Vercel function entry point.
 *
 * Mirrors what Vercel actually does at runtime: wrap the exported handler in
 * http.createServer and dispatch real requests at it. This is the deployed
 * path, and nothing else in the suite touches it — the Express tests all build
 * the app directly and bypass the adapter.
 */
import fs from 'node:fs'
import http from 'node:http'

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
// Exercise the real production code path, including the CORS guard.
process.env.NODE_ENV = 'production'
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'https://app.example.com'
delete process.env.REDIS_URL

const { default: handler } = await import('./api/index.js')

const server = http.createServer((req, res) => { void handler(req, res) })
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port
const base = `http://127.0.0.1:${port}`

let failures = 0
async function check(label: string, path: string, init: RequestInit | undefined, expectStatus: number) {
  const res = await fetch(`${base}${path}`, init)
  const body = await res.text()
  const ok = res.status === expectStatus
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${res.status} (want ${expectStatus})`)
  console.log(`      body: ${body.slice(0, 160)}`)
  return res
}

await check('GET /health (was 404 under the old routes config)', '/health', undefined, 200)

// The API surface is mounted at /api/v1 and must still be reachable.
await check('GET /api/v1/employees without a token', '/api/v1/employees', undefined, 401)

// CORS: an allowlisted origin is echoed with credentials, a stranger is not.
// Use an origin that is genuinely on the allowlist, not one we assume.
const allowlist = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
const allowlisted = allowlist[0]
const stranger = 'https://not-allowlisted.example'
const okOrigin = await fetch(`${base}/health`, { headers: { Origin: allowlisted } })
const okHeader = okOrigin.headers.get('access-control-allow-origin')
const badOrigin = await fetch(`${base}/health`, { headers: { Origin: stranger } })
const badHeader = badOrigin.headers.get('access-control-allow-origin')
const corsOk = okHeader === allowlisted && badHeader === null
if (!corsOk) failures++
console.log(`${corsOk ? 'PASS' : 'FAIL'}  CORS echoes an allowlisted origin and withholds a stranger`)
console.log(`      allowlisted ${allowlisted} -> ${okHeader}`)
console.log(`      stranger    ${stranger} -> ${badHeader}`)
console.log(`      allowlist size: ${allowlist.length}`)

// A root-level 404 must still be the app's own JSON, not Vercel's HTML.
const missing = await check('GET /nope is the app 404, not the platform 404', '/nope', undefined, 404)
console.log('      content-type:', missing.headers.get('content-type'))

server.close()
console.log(failures === 0 ? '\nALL ADAPTER CHECKS PASSED' : `\n${failures} ADAPTER CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
