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

declare module 'express-rate-limit' {
  const rateLimit: any
  export default rateLimit
}

declare module 'jose' {
  export const SignJWT: any
  export const jwtVerify: any
}

declare module '@vercel/blob' {
  export const put: any
  export const del: any
}
