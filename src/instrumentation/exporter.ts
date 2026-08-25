import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-node";
import SpanMapper from "./span-mapper";
import TraceAssembler from "../core/trace-assembler";
import TraceStore from "../core/trace-store";


export default class ServerDevToolsExporter implements SpanExporter {
    private readonly spanMapper = new SpanMapper();

    constructor(
        private readonly traceAssembler: TraceAssembler,
        private readonly traceStore: TraceStore,
    ) { }

    export(
        spans: ReadableSpan[],
        resultCallback: (result: ExportResult) => void,
    ): void {
        for (const span of spans) {
            const devToolsSpan = this.spanMapper.map(span);

            this.traceAssembler.addSpan(devToolsSpan);

            const trace = this.traceAssembler.getTrace(
                devToolsSpan.traceId,
            );

            if (trace) {
                this.traceStore.add(trace);
                console.dir(this.traceStore.get(trace.traceId), {
                    depth: null,
                });
            }
        }

        resultCallback({
            code: ExportResultCode.SUCCESS,
        });
    }

    async shutdown(): Promise<void> {
        return;
    }

}