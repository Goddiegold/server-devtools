import type { IDashboardRequest } from "@/types"
import { apiFetch } from "@/api/client"

export interface IRequestsPagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface IRequestsResponse {
  data: IDashboardRequest[]
  pagination: IRequestsPagination
}

export async function getRequests(page = 1, limit = 20): Promise<IRequestsResponse> {
  const response = await apiFetch(
    `/_devtools/api/requests?page=${page}&limit=${limit}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch requests: ${response.status}`)
  }

  return response.json()
}
