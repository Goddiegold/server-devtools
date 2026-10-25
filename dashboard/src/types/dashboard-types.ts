import type { IDevToolsCurrentUser } from "./traces.types"

export interface IDashboardRequest {
  id: string
  method: string
  path: string
  route?: string
  statusCode?: number
  durationMs?: number
  startedAt: number
  hasError: boolean
  user?: IDevToolsCurrentUser
}

export type DashboardOverviewRange = "15m" | "1h" | "6h" | "24h"

export interface IOverviewVolumeBucket {
  startAt: number
  endAt: number
  count: number
}

export interface IOverviewMetrics {
  range: DashboardOverviewRange
  from: number
  to: number
  totalRequests: number
  errorRate: number
  averageLatencyMs: number
  slowRequests: number
  volume: IOverviewVolumeBucket[]
  recentFailures: IDashboardRequest[]
}
