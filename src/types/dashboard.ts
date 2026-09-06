
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