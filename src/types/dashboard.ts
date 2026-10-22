import { IDevToolsSpanType } from "./span";

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

export type DashboardOverviewRange = "15m" | "1h" | "6h" | "24h";

export interface IOverviewVolumeBucket {
  startAt: number;
  endAt: number;
  count: number;
}

export interface IOverviewMetrics {
  range: DashboardOverviewRange;
  from: number;
  to: number;
  totalRequests: number;
  errorRate: number;
  averageLatencyMs: number;
  slowRequests: number;
  volume: IOverviewVolumeBucket[];
  recentFailures: IDashboardRequest[];
}

export interface IDevToolsResponse {
  statusCode?: number;
  headers: Record<string, string | string[]>;
  body?: unknown;
}

export interface IDevToolsError {
  spanId: string;
  spanName: string;
  spanType: IDevToolsSpanType;

  type?: string;
  message?: string;
  stack?: string;

  startedAt: number;
}

export interface ISession {
    sessionHash: string;
    username: string;
    createdAt: number;
    expiresAt: number;
}
