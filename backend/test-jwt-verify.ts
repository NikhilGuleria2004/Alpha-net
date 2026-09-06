import { jwtVerify } from 'jose'

async function main() {
  const secret = new TextEncoder().encode('test-secret')
  try {
    const result = await jwtVerify('invalid-token', secret, { algorithms: ['HS256'] })
    console.log('Verified:', result.payload)
  } catch (err) {
    console.log('Error:', (err as Error).message)
  }
}

main()
