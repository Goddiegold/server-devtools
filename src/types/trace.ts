// src/core/trace.ts

import { IDevToolsCurrentUser } from './misc';
import type { IDevToolsSpan } from './span';

export interface IDevToolsTrace {
    traceId: string;
    rootSpanId?: string;
    spans: IDevToolsSpan[];
    startedAt: number;
    durationMs?: number;
    user?: IDevToolsCurrentUser;
}
export interface ITraceMetadata {
    request?: {
        body?: unknown;
    };

    response?: {
        body?: unknown;
    };
    user?: IDevToolsCurrentUser;
}

export interface ITraceSummary {
    traceId: string;
    rootSpanId?: string;
    startedAt: number;
    durationMs?: number;
    method?: string;
    path?: string;
    route?: string;
    statusCode?: number;
    hasError: boolean;
    user?: IDevToolsCurrentUser;
}
