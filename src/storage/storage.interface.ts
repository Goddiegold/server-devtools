import type {
    IDevToolsCurrentUser,
    IDevToolsSpan,
    IDevToolsTrace,
    IHttpClientDetails,
    ISession,
    ITraceMetadata,
    ITraceSummary,
} from "../types";

export interface IStorage {
    initialize(): Promise<void>;

    saveSpan(span: IDevToolsSpan): Promise<void>;

    getSpansByTraceId(traceId: string): Promise<IDevToolsSpan[]>;

    getTrace(traceId: string): Promise<IDevToolsTrace | undefined>;

    saveTraceSummary(span: IDevToolsSpan): Promise<void>;

    getTraceSummaries(): Promise<ITraceSummary[]>;

    getPaginatedTraceSummaries(
        page: number,
        limit: number,
        search?: string,
        method?: string,
        statusCode?: number,
    ): Promise<{
        summaries: ITraceSummary[];
        total: number;
    }>;

    saveRequestBody(traceId: string, body: unknown): Promise<void>;

    saveResponseBody(traceId: string, body: unknown): Promise<void>;

    getTraceMetadata(traceId: string): Promise<ITraceMetadata | undefined>;

    deleteTrace(traceId: string): Promise<void>;

    clearHistory(): Promise<void>;

    saveSession(session: ISession): Promise<void>;

    getSessionByHash(sessionHash: string): Promise<ISession | undefined>;

    deleteSession(sessionHash: string): Promise<void>;

    saveCurrentUser(
        traceId: string,
        user: IDevToolsCurrentUser,
    ): Promise<void>;

    updateHttpClientDetails(
        spanId: string,
        details: Partial<Omit<IHttpClientDetails, "spanId">>,
    ): Promise<void>;

    getHttpClientDetails(
        spanId: string,
    ): Promise<IHttpClientDetails | undefined>;

    close(): Promise<void>;
}
