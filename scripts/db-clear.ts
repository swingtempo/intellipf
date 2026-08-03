import fs from 'node:fs'
import path from 'node:path'

const dbDir = path.resolve(process.cwd(), 'data')
const files = ['sqlite.db', 'sqlite.db-wal', 'sqlite.db-shm']

for (const file of files) {
  const fullPath = path.join(dbDir, file)
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      console.log(`Deleted: ${fullPath}`)
    }
  } catch (err) {
    console.error(`Failed to delete ${fullPath}:`, err)
  }
}

console.log('Database cleared.')
