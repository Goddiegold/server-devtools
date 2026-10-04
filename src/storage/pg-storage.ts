import { IDevToolsSpan, IDevToolsTrace, ITraceSummary, ITraceMetadata, ISession, IDevToolsCurrentUser, IHttpClientDetails } from "../types";
import { IStorage } from "../types";


export default class PgStorage implements IStorage {
    initialize(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    saveSpan(span: IDevToolsSpan): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getSpansByTraceId(traceId: string): Promise<IDevToolsSpan[]> {
        throw new Error("Method not implemented.");
    }
    getTrace(traceId: string): Promise<IDevToolsTrace | undefined> {
        throw new Error("Method not implemented.");
    }
    saveTraceSummary(span: IDevToolsSpan): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getTraceSummaries(): Promise<ITraceSummary[]> {
        throw new Error("Method not implemented.");
    }
    getPaginatedTraceSummaries(page: number, limit: number, search?: string, method?: string, statusCode?: number): Promise<{ summaries: ITraceSummary[]; total: number; }> {
        throw new Error("Method not implemented.");
    }
    saveRequestBody(traceId: string, body: unknown): Promise<void> {
        throw new Error("Method not implemented.");
    }
    saveResponseBody(traceId: string, body: unknown): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getTraceMetadata(traceId: string): Promise<ITraceMetadata | undefined> {
        throw new Error("Method not implemented.");
    }
    deleteTrace(traceId: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    clearHistory(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    saveSession(session: ISession): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getSessionByHash(sessionHash: string): Promise<ISession | undefined> {
        throw new Error("Method not implemented.");
    }
    deleteSession(sessionHash: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    saveCurrentUser(traceId: string, user: IDevToolsCurrentUser): Promise<void> {
        throw new Error("Method not implemented.");
    }
    updateHttpClientDetails(spanId: string, details: Partial<Omit<IHttpClientDetails, "spanId">>): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getHttpClientDetails(spanId: string): Promise<IHttpClientDetails | undefined> {
        throw new Error("Method not implemented.");
    }
    close(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    
}