import { IDevToolsTrace } from "../types";



export default class DashboardRequestDetailMapper {

    map(trace: IDevToolsTrace) {
        const rootSpan = trace.spans.find(span => span.spanId === trace.rootSpanId && span.type === 'http.server');

        if (!rootSpan) {
            throw new Error(`Http server root span not found for trace ${trace.traceId}`);
        }

        console.log({
            rootSpanAttributes: rootSpan.attributes['http.server']
        })

        return {
            method: String(rootSpan.attributes['http.request.method'] ?? "UNKNOWN"),
            path: String(rootSpan.attributes['url.path'] ?? ""),
            route: rootSpan.attributes['http.route'] ? String(rootSpan.attributes['http.route']) : undefined,
            headers: {},
            query: this.mapQuery(
                rootSpan.attributes["url.query"]
            ),
            params: {},
            body: undefined,
        }
    }

    private mapQuery(query?: unknown): Record<string, string | string[]> {
        if (typeof query !== "string" || !query) {
            return {};
        }

        const params = new URLSearchParams(query);
        const result: Record<string, string | string[]> = {};

        for (const [key, value] of params) {
            const existing = result[key];

            if (existing === undefined) {
                result[key] = value;
            } else if (Array.isArray(existing)) {
                existing.push(value);
            } else {
                result[key] = [existing, value];
            }
        }

        return result;
    }
}