import { apiFetch } from "@/api/client"
import type { DashboardOverviewRange, IOverviewMetrics } from "@/types"

export async function getOverview(
  range: DashboardOverviewRange = "1h"
): Promise<IOverviewMetrics> {
  const response = await apiFetch(
    `/_devtools/api/overview?range=${encodeURIComponent(range)}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch overview: ${response.status}`)
  }

  return response.json()
}
