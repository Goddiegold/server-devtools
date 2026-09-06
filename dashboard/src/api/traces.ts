import type { IDevToolsTrace } from "@/types"

export async function getTrace(traceId: string): Promise<IDevToolsTrace> {
  const response = await fetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch trace: ${response.status}`)
  }

  return response.json()
}
