import type { IDashboardRequest } from "@/types"
import { apiFetch } from "@/api/client"

export async function getRequests(): Promise<IDashboardRequest[]> {
  const response = await apiFetch("/_devtools/api/requests")

  if (!response.ok) {
    throw new Error(`Failed to fetch requests: ${response.status}`)
  }

  return response.json()
}
