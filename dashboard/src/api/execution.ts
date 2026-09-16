import type { IExecutionNode } from "@/types"
import { apiFetch } from "@/api/client"

export interface IHttpClientDetails {
  spanId: string
  requestHeaders?: Record<string, string | string[]>
  requestBody?: unknown
  responseHeaders?: Record<string, string | string[]>
  responseBody?: unknown
}

export interface IHttpClientDetailsResponse {
  span: IExecutionNode["span"]
  details?: IHttpClientDetails
}

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

export async function getHttpClientDetails(
  traceId: string,
  spanId: string
): Promise<IHttpClientDetailsResponse> {
  const response = await apiFetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}/http-client/${encodeURIComponent(spanId)}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch HTTP client details: ${response.status}`)
  }

  return response.json()
}
