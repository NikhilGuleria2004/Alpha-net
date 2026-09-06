// @ts-ignore
import pino from 'pino'

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['password', 'token', 'accessToken', 'refreshToken', 'secret', 'authorization'],
    censor: '[REDACTED]',
  },
})
