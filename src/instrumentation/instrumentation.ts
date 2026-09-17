import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import ServerDevToolsExporter from "./exporter";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import SQLiteStorage from "../storage/sqlite-storage";
import { OutboundHttpCapture } from "./outbound-http/outbound-http-capture";
import { ClientRequest, IncomingMessage } from "node:http";
import { debugLog } from "../utils/logger";


export class Instrumentation {
    private readonly oTelSdk: NodeSDK;
    private readonly outboundHttpCapture: OutboundHttpCapture;
    private isShutdown = false;

    constructor(
        private readonly storage: SQLiteStorage
    ) {
        this.outboundHttpCapture =
            new OutboundHttpCapture(storage);

        this.oTelSdk = new NodeSDK({
            spanProcessors: [
                new SimpleSpanProcessor(new ServerDevToolsExporter(this.storage)),
            ],
            instrumentations: [
                new HttpInstrumentation(
                    {
                        ignoreIncomingRequestHook: (request) => {
                            const pathname = request.url?.split("?")[0] ?? "";

                            return (
                                pathname.startsWith("/_devtools") ||
                                pathname === "/.well-known/appspecific/com.chrome.devtools.json"
                            );
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


                        requestHook: (_span, request) => {
                            if (!(request instanceof ClientRequest)) {
                                return;
                            }
                            this.outboundHttpCapture.trackNativeRequest(
                                _span.spanContext().spanId,
                                request,
                            );
                        },

                        responseHook: (_span, response) => {
                            if (!(response instanceof IncomingMessage)) {
                                return;
                            }

                            this.outboundHttpCapture.trackNativeResponse(
                                _span.spanContext().spanId,
                                response,
                            );
                        },
                    }
                ),
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

                    requestHook: (span, _request) => {
                        debugLog("Undici outbound request", {
                            spanId: span.spanContext().spanId,
                            traceId: span.spanContext().traceId,
                        });
                        this.outboundHttpCapture.associateFetchSpan(
                            span.spanContext().spanId,
                        );
                    },

                    responseHook: (span, responseInfo) => {
                        debugLog("Undici outbound response", {
                            spanId: span.spanContext().spanId,
                            traceId: span.spanContext().traceId,
                            statusCode: responseInfo.response.statusCode,
                        });
                    },
                }),
                new ExpressInstrumentation({
                    requestHook: (span, info) => {
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
        debugLog("Starting OpenTelemetry SDK");
        await this.oTelSdk.start();
        this.outboundHttpCapture.startFetchCapture();
        debugLog("OpenTelemetry SDK started");
    }

    async shutdown() {
        if (this.isShutdown) {
            return;
        }
        this.isShutdown = true;

        debugLog("Shutting down OpenTelemetry SDK");
        this.outboundHttpCapture.stopFetchCapture();
        try {
            await this.oTelSdk.shutdown();
        } finally {
            this.storage.close();
        }
        debugLog("OpenTelemetry SDK shut down");
    }
}
