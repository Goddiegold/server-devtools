import { apiFetch } from "@/api/client"
import type { IDashboardConfig } from "@/types"

export async function getDashboardConfig(): Promise<IDashboardConfig> {
  const response = await apiFetch("/_devtools/api/config")

  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard config: ${response.status}`)
  }

  return response.json()
}