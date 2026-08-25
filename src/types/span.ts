

export type DevToolsSpanType =
  | 'http.server'
  | 'http.client'
  | 'database'
  | 'framework'
  | 'unknown';

export interface IDevToolsSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;

  type: DevToolsSpanType;

  name: string;

  startedAt: number;
  durationMs: number;

  attributes: Record<string, unknown>;

  status: {
    code: number;
    message?: string;
  };
}