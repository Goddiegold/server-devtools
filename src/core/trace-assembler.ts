import type { IDevToolsSpan, IDevToolsTrace } from "../types";


export default class TraceAssembler {
    private readonly traces = new Map<string, IDevToolsTrace>();

    addSpan(span: IDevToolsSpan): void {
        const existingTrace = this.traces.get(span.traceId);

        if (!existingTrace) {
            this.traces.set(span.traceId, {
                traceId: span.traceId,
                rootSpanId: span.parentSpanId
                    ? undefined
                    : span.spanId,
                spans: [span],
                startedAt: span.startedAt,
                durationMs: span.parentSpanId ? undefined : span.durationMs,
            })
            return;
        } else {
            existingTrace.spans.push(span);

            existingTrace.startedAt = Math.min(existingTrace.startedAt, span.startedAt);

            if (!span.parentSpanId) {
                existingTrace.durationMs = span.durationMs;
                existingTrace.rootSpanId = span.spanId;
            }
        }

    }

    getTrace(traceId: string) {
        return this.traces.get(traceId);
    }

}