// Ensure required env vars are present for tests before any module loads.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production'
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'eniac_test'
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-do-not-use-in-production'
