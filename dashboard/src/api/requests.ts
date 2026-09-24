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

export async function getRequests(
  page = 1,
  limit = 20,
  search = "",
  method = "",
  status = "",
): Promise<IRequestsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (search.trim()) {
    params.set("search", search)
  }
  if (method) {
    params.set("method", method)
  }
  if (status) {
    params.set("status", status)
  }

  const response = await apiFetch(
    `/_devtools/api/requests?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch requests: ${response.status}`)
  }

  return response.json()
}
