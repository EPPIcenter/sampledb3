/** UTC timestamp in SQLite canonical format: YYYY-MM-DD HH:MM:SS */
export function utcNow(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
}
