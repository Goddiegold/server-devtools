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
        private readonly storage: SQLiteStorage
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
                            client: {
                                requestHeaders: [
                                    "content-type",
                                    "authorization",
                                    "x-test-header",
                                ],
                                responseHeaders: [
                                    "content-type",
                                    "x-test-response",
                                ],
                            },
                        },
                    }
                ),
                // new UndiciInstrumentation(),
                // new ExpressInstrumentation(),
                new UndiciInstrumentation({
                    headersToSpanAttributes: {
                        requestHeaders: [
                            "content-type",
                            "x-test-header",
                        ],
                        responseHeaders: [
                            "content-type",
                        ],
                    },

                    requestHook: (_span, request) => {
                        console.log("UNDICI REQUEST:", {
                            origin: request.origin,
                            method: request.method,
                            path: request.path,
                            headers: request.headers,
                            contentLength: request.contentLength,
                            contentType: request.contentType,
                            body: request.body,
                        });
                    },

                    responseHook: (_span, { request, response }) => {
                        console.log("UNDICI RESPONSE:", {
                            request: {
                                origin: request.origin,
                                method: request.method,
                                path: request.path,
                            },
                            response: {
                                statusCode: response.statusCode,
                                statusText: response.statusText,
                                headers: response.headers,
                            },
                        });
                    },
                }),
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
