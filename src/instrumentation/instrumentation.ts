import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import ServerDevToolsExporter from "./exporter";
import { ExpressInstrumentation, ExpressLayerType } from "@opentelemetry/instrumentation-express";
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import TraceMetadataStore from "../core/trace-metadata-store";
import SQLiteStorage from "../storage/sqlite-storage";


export class Instrumentation {
    private readonly oTelSdk: NodeSDK;
    readonly traceMetadataStore: TraceMetadataStore;
    readonly storage =
        new SQLiteStorage("./server-devtools.db");

    constructor() {
        this.oTelSdk = new NodeSDK({
            spanProcessors: [
                new SimpleSpanProcessor(new ServerDevToolsExporter(this.storage)),
            ],
            instrumentations: [
                new HttpInstrumentation(
                    {
                        ignoreIncomingRequestHook: (request) => {
                            return request.url?.split('?')[0].startsWith("/_devtools") ?? false;
                        },
                        headersToSpanAttributes: {
                            server: {
                                requestHeaders: [
                                    "content-type",
                                    "user-agent",
                                ],
                                responseHeaders: [
                                    "content-type",
                                    "user-agent",
                                ]
                            },
                        },
                    }
                ),
                new UndiciInstrumentation(),
                // new ExpressInstrumentation(),
                new ExpressInstrumentation({
                    requestHook: (span, info) => {
                        if (info.layerType === ExpressLayerType.REQUEST_HANDLER) {
                            console.log("DEVTOOLS REQUEST BODY:", info.request.body);
                        }

                        if (info.request.body === undefined) {
                            return;
                        }

                        const traceId = span.spanContext().traceId;

                        traceMetadataStore.setRequestBody(
                            traceId,
                            info.request.body,
                        );

                        console.log(
                            "TRACE METADATA:",
                            traceMetadataStore.get(traceId),
                        );
                    },
                }),
                new MongoDBInstrumentation({
                    enhancedDatabaseReporting: false,
                }),
            ],
        });

        const traceMetadataStore = new TraceMetadataStore();

        this.traceMetadataStore = traceMetadataStore;
    }

    async start() {
        await this.oTelSdk.start();
    }

    async shutdown() {
        await this.oTelSdk.shutdown();
        this.storage.close();
    }
}
