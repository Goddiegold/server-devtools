import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import ServerDevToolsExporter from "./exporter";
import { ExpressInstrumentation, ExpressLayerType } from "@opentelemetry/instrumentation-express";
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import SQLiteStorage from "../storage/sqlite-storage";


export class Instrumentation {
    private readonly oTelSdk: NodeSDK;
    constructor(
      private readonly  storage: SQLiteStorage
    ) {
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


                        this.storage.saveRequestBody(traceId, info.request.body)

                    },
                }),
                new MongoDBInstrumentation({
                    enhancedDatabaseReporting: false,
                }),
            ],
        });

    }

    async start() {
        await this.oTelSdk.start();
    }

    async shutdown() {
        await this.oTelSdk.shutdown();
        this.storage.close();
    }
}
