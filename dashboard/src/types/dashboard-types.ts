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
