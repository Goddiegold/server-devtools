import type { IDevToolsTrace } from "@/types"
import { apiFetch } from "@/api/client"

export interface ITraceRequest {
  method?: string
  path?: string
  route?: string
  headers?: Record<string, string[]>
  query?: Record<string, unknown>
  params?: Record<string, unknown>
  body?: unknown
}

export interface ITraceResponse {
  statusCode?: number
  headers?: Record<string, string[]>
  body?: string
}

export interface ITraceError {
  spanId?: string
  spanName?: string
  spanType?: string
  type?: string
  message?: string
  stack?: string
  startedAt?: number
}

export async function getTrace(traceId: string): Promise<IDevToolsTrace> {
  const response = await apiFetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch trace: ${response.status}`)
  }

  return response.json()
}

export async function getTraceRequest(traceId: string): Promise<ITraceRequest> {
  const response = await apiFetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}/request`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch request details: ${response.status}`)
  }

  return response.json()
}

export async function getTraceResponse(traceId: string): Promise<ITraceResponse> {
  const response = await apiFetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}/response`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch response details: ${response.status}`)
  }

  return response.json()
}

export async function getTraceErrors(traceId: string): Promise<ITraceError[]> {
  const response = await apiFetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}/errors`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch error details: ${response.status}`)
  }

  return response.json()
}

export async function deleteTrace(traceId: string): Promise<void> {
  const response = await apiFetch(
    `/_devtools/api/traces/${encodeURIComponent(traceId)}`,
    { method: "DELETE" }
  )

  if (!response.ok) {
    throw new Error(`Failed to delete trace: ${response.status}`)
  }
}

export async function clearHistory(): Promise<void> {
  const response = await apiFetch("/_devtools/api/traces", { method: "DELETE" })

  if (!response.ok) {
    throw new Error(`Failed to clear history: ${response.status}`)
  }
}
