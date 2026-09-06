import type { IDashboardRequest } from "@/types"

export async function getRequests(): Promise<IDashboardRequest[]> {
  const response = await fetch("/_devtools/api/requests")

  if (!response.ok) {
    throw new Error(`Failed to fetch requests: ${response.status}`)
  }

  return response.json()
}