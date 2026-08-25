import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import ServerDevToolsExporter from "./exporter";
import TraceAssembler from "../core/trace-assembler";
import TraceStore from "../core/trace-store";


export class Instrumentation {
    private readonly oTelSdk: NodeSDK;
    readonly traceStore: TraceStore;

    constructor() {
        const traceAssembler = new TraceAssembler();
        const traceStore = new TraceStore();
        this.traceStore = traceStore;

        this.oTelSdk = new NodeSDK({
            spanProcessors: [
                new SimpleSpanProcessor(new ServerDevToolsExporter(traceAssembler, traceStore)),
            ],
            instrumentations: [
                new HttpInstrumentation(),
                new UndiciInstrumentation(),
            ],
        });
    }

    async start() {
        await this.oTelSdk.start();
    }

    async shutdown() {
        await this.oTelSdk.shutdown();
    }
}