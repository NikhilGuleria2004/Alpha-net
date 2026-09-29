import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['src/tests/setup.ts'],
    // ts.md Phase 8.3: the suite runs one worker per file (46+), and every HTTP
    // suite cold-imports the whole Express app inside a test body. Under that
    // startup load the 5s default intermittently failed the *import* rather
    // than an assertion (assignments/clients/flow-baseline/payrolls "mounted"
    // tests). 15s leaves the real 5s assertions honest while absorbing the
    // cold-import spike; the whole suite still finishes in well under a minute.
    testTimeout: 15_000,
  },
})
