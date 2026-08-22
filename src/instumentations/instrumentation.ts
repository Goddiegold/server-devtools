import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import ServerDevToolsExporter from "./exporter";


export class Instrumentation {
    private readonly oTelSdk: NodeSDK;

    constructor() {
        this.oTelSdk = new NodeSDK({
            spanProcessors: [
                new SimpleSpanProcessor(new ServerDevToolsExporter()),
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