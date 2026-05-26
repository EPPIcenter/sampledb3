import type { Context } from 'hono'
import type { Database } from '../db/client'

export function setRequestDatabase(c: Context, database: Database): void {
  c.set('db', database)
}

export function getRequestDatabase(c: Context): Database {
  const database = c.get('db') as Database | undefined
  if (!database) {
    throw new Error('Database not set on request context — add setRequestDatabase middleware')
  }
  return database
}
