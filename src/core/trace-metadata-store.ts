import { ITraceMetadata } from "../types";


export default class TraceMetadataStore {
    private readonly metadata = new Map<string, ITraceMetadata>();

    get(traceId: string): ITraceMetadata | undefined {
        return this.metadata.get(traceId)
    }

    setRequestBody(traceId: string, body: unknown) {
        const existing = this.metadata.get(traceId) ?? {};

        this.metadata.set(traceId, {
            ...existing,
            request: {
                ...existing.request,
                body
            }
        })
    }

    setResponseBody(traceId: string, body: unknown) {
        const existing = this.metadata.get(traceId) ?? {};

        this.metadata.set(traceId, {
            ...existing,
            response: {
                ...existing.response,
                body
            }
        })
    }

    delete(traceId: string): void {
        this.metadata.delete(traceId)
    }

    clear(): void {
        this.metadata.clear()
    }

}