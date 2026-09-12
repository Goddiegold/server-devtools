
export interface IDashboardRequest {
  id: string;

  method: string;

  // What was actually requested
  path: string;

  // Framework route template
  route?: string;

  statusCode?: number;
  durationMs?: number;
  startedAt: number;

  hasError: boolean;
}

export interface IDevToolsResponse {
  statusCode?: number;
  headers: Record<string, string | string[]>;
  body?: unknown;
}

export interface IDevToolsError {
    spanId: string;
    spanName: string;
    spanType: SpanType;

    type?: string;
    message?: string;
    stack?: string;

    startedAt: number;
}