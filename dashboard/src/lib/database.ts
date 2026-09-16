export function formatDatabaseQuery(query: string) {
  try {
    return JSON.stringify(JSON.parse(query), null, 2)
  } catch {
    return query
  }
}
