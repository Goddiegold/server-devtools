import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-node";
import SpanMapper from "./span-mapper";
import SQLiteStorage from "../storage/sqlite-storage";


export default class ServerDevToolsExporter implements SpanExporter {
    private readonly spanMapper = new SpanMapper();

    constructor(
        private readonly storage: SQLiteStorage
    ) { }

    export(
        spans: ReadableSpan[],
        resultCallback: (result: ExportResult) => void,
    ): void {
        try {
            for (const span of spans) {
                // console.log({ span })
                const devToolsSpan = this.spanMapper.map(span);

                this.storage.saveSpan(devToolsSpan);

                if (!devToolsSpan.parentSpanId) {
                    this.storage.saveTraceSummary(devToolsSpan);
                }
            }

            resultCallback({
                code: ExportResultCode.SUCCESS,
            });
        } catch (error) {
            resultCallback({
                code: ExportResultCode.FAILED,
                error: error instanceof Error
                    ? error
                    : new Error(String(error)),
            });
        }
    }

    async shutdown(): Promise<void> {
        return;
    }

}
