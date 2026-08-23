import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-node";
import SpanMapper from "./span-mapper";


export default class ServerDevToolsExporter implements SpanExporter {
    private readonly spanMapper = new SpanMapper();

    export(
        spans: ReadableSpan[],
        resultCallback: (result: ExportResult) => void,
    ) {

        for (const span of spans) {
            console.log(`Exporting span: ${span.name}`);

            const context = span.spanContext();
            console.log(`Span context: traceId=${context.traceId}, spanId=${context.spanId}`);

            // console.log({
            //     traceId: context.traceId,
            //     spanId: context.spanId,
            //     parentSpanId: span.parentSpanContext?.spanId,
            //     name: span.name,
            //     kind: span.kind,
            //     duration: span.duration,
            //     attributes: span.attributes,
            //     status: span.status,
            // });

            const devToolsSpan = this.spanMapper.map(span);
            
            console.log(devToolsSpan);
        }

        resultCallback({ code: ExportResultCode.SUCCESS });
    }

    async shutdown(): Promise<void> {
        return;
    }

}