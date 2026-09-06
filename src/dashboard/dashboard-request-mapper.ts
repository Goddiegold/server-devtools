import { IDashboardRequest, IDevToolsTrace } from "../types";


export default class DashboardRequestMapper {

    map(trace: IDevToolsTrace): IDashboardRequest {
        const rootSpan = trace.spans.find(span => span.spanId === trace.rootSpanId && span.type === 'http.server')
        console.log(JSON.stringify({ trace }, null, 2));

        if (!rootSpan) {
            throw new Error(
                `HTTP server root span not found for trace ${trace.traceId}`,
            );
        }

        const statusCode = rootSpan.attributes['http.response.status_code'];

        return {
            id: trace.traceId,
            method: String(rootSpan.attributes['http.request.method'] ?? 'UNKNOWN'),

            path: String(rootSpan.attributes['url.path'] ?? rootSpan.attributes['http.route'] ?? undefined),
            durationMs: rootSpan.durationMs,

            route: rootSpan.attributes['http.route'] ? String(rootSpan.attributes['http.route']) : undefined,

            statusCode: typeof statusCode === 'number' ? statusCode : undefined,

            startedAt: rootSpan.startedAt,
            hasError: (typeof statusCode === 'number' && statusCode >= 400) || rootSpan.error !== undefined,
        }
    }

}