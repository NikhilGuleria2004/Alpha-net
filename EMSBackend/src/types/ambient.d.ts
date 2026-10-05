declare module 'pino' {
  const pino: any
  export default pino
}

declare module 'pino-http' {
  const pinoHttp: any
  export default pinoHttp
}

declare module 'bcryptjs' {
  const bcryptjs: any
  export default bcryptjs
}

declare module 'helmet' {
  const helmet: any
  export default helmet
}

declare module 'jose' {
  export const SignJWT: any
  export const jwtVerify: any
}

declare module '@vercel/blob' {
  export const put: any
  export const del: any
  export const get: any
}

/**
 * `express-rate-limit` is dual-published, and its three declaration files
 * (.d.ts / .d.cts / .d.mts) are byte-identical and written with ESM
 * `export { rateLimit as default }` syntax. Which shape a default import binds
 * therefore depends on which declaration entry the resolver selects — and on
 * Vercel's build the default import binds the module *namespace* instead of the
 * function, so every `rateLimit(...)` call site fails to compile with
 * "TS2349: This expression is not callable" on a tree that is otherwise
 * identical to, and builds fine on, the developer's machine.
 *
 * Declaring the module here makes the shape deterministic in every environment.
 * Unlike the `const rateLimit: any` stub this replaces, the signature is typed,
 * so limiter options are still checked: an unrecognised option or a mistyped
 * keyGenerator fails the build instead of passing silently.
 */
declare module 'express-rate-limit' {
  import type { NextFunction, Request, Response } from 'express'

  /** Hit-counter backend. Shared across instances when backed by Redis. */
  export type Store = {
    init?: (options: Options) => void
    increment: (key: string) => Promise<{ totalHits: number; resetTime: number }>
    decrement: (key: string) => void
    resetKey: (key: string) => void
    resetAll?: () => void
  }

  export interface Options {
    windowMs?: number
    max?: number
    standardHeaders?: boolean | string
    legacyHeaders?: boolean
    keyGenerator?: (req: Request) => string | Promise<string>
    skip?: (req: Request) => boolean
    skipFailedRequests?: boolean
    message?: unknown
    handler?: (req: Request, res: Response, next: NextFunction, options: Options) => void
    /** Omitted keeps the library's own per-process MemoryStore. */
    store?: Store
    passOnStoreError?: boolean
  }

  export type Middleware = (req: Request, res: Response, next: NextFunction) => void

  export default function rateLimit(options?: Options): Middleware
}
