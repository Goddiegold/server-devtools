import type { IExecutionNode } from "@/types"
import { apiFetch } from "@/api/client"

export async function getExecutionTree(
  traceId: string
): Promise<IExecutionNode[]> {
  const response = await apiFetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}/execution`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch execution tree: ${response.status}`)
  }

  return response.json()
}
