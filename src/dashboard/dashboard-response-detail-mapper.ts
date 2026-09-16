import { IDevToolsResponse, IDevToolsTrace, ITraceMetadata } from "../types";


export default class DashboardResponseDetailMapper {
    map(
        trace: IDevToolsTrace,
        metadata?: ITraceMetadata,
    ): IDevToolsResponse {
        const rootSpan = trace.spans.find(span => span.spanId === trace.rootSpanId && span.type === 'http.server');

        if (!rootSpan) {
            throw new Error(`Http server root span not found for trace ${trace.traceId}`);
        }

        // find http.server root span
        // map status
        // map response headers
        // get metadata?.response?.body
        return {
            statusCode: rootSpan.attributes["http.response.status_code"] as number,
            headers: this.mapHeaders(rootSpan.attributes),
            "body": metadata?.response?.body || null
        }
    }



    private mapHeaders(
        attributes: Record<string, unknown>
    ): Record<string, string | string[]> {
        const headers: Record<string, string | string[]> = {};
        const prefix = "http.response.header.";

        for (const [key, value] of Object.entries(attributes)) {
            if (!key.startsWith(prefix)) {
                continue;
            }

            const headerName = key.slice(prefix.length);

            if (typeof value === "string") {
                headers[headerName] = value;
            } else if (
                Array.isArray(value) &&
                value.every(item => typeof item === "string")
            ) {
                headers[headerName] = value;
            }
        }

        return headers;
    }
}
