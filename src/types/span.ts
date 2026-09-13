

export type IDevToolsSpanType =
  | 'http.server'
  | 'http.client'
  | 'database'
  | 'framework'
  | 'unknown';

export interface IDevToolsSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;

  type: IDevToolsSpanType;

  name: string;

  startedAt: number;
  durationMs: number;

  attributes: Record<string, unknown>;

  status: {
    code: number;
    message?: string;
  };
  error?: {
    type?: string;
    message?: string;
    stack?: string;
  };
}

export interface IExecutionNode {
    span: IDevToolsSpan;
    children: IExecutionNode[];
}