import { IDevToolsTrace, ITraceMetadata } from "../types";



export default class DashboardRequestDetailMapper {

    map(trace: IDevToolsTrace, metadata?: ITraceMetadata,) {
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
            headers: this.mapHeaders(rootSpan.attributes),
            query: this.mapQuery(
                rootSpan.attributes["url.query"]
            ),
            params: this.mapParams(
                rootSpan.attributes["http.route"],
                rootSpan.attributes["url.path"]
            ),
            body: metadata?.request?.body,
            // response: metadata?.response?.body || null
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


    private mapHeaders(
        attributes: Record<string, unknown>
    ): Record<string, string | string[]> {
        const headers: Record<string, string | string[]> = {};
        const prefix = "http.request.header.";

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

    private mapParams(
        route?: unknown,
        path?: unknown
    ): Record<string, string> {
        if (typeof route !== "string" || typeof path !== "string") {
            return {};
        }

        const routeParts = route.split("/");
        const pathParts = path.split("/");

        if (routeParts.length !== pathParts.length) {
            return {};
        }

        const params: Record<string, string> = {};

        for (let i = 0; i < routeParts.length; i++) {
            const routePart = routeParts[i];

            if (routePart.startsWith(":")) {
                const paramName = routePart.slice(1);
                params[paramName] = decodeURIComponent(pathParts[i]);
            }
        }

        return params;
    }
}