
export interface IDevToolsSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  type: string
  name: string
  startedAt: number
  durationMs: number
  attributes: Record<string, unknown>
  status: {
    code: number
    message?: string
  }
  error?: {
    type?: string
    message?: string
    stack?: string
  }
}

export interface IDevToolsTrace {
  traceId: string
  rootSpanId?: string
  spans: IDevToolsSpan[]
  startedAt: number
  durationMs?: number
}