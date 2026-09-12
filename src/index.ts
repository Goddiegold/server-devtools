// import { Instrumentation } from "./instumentations/instrumentation";

import { IncomingMessage, ServerResponse } from "node:http";
import DashboardServer from "./dashboard/dashboard-server";
import { Instrumentation } from "./instrumentation/instrumentation";
import { context, trace } from "@opentelemetry/api";
import { IServerDevlToolsParams } from "./types";
import config from "./config";

class ServerDevTools {
    private instrumentation: Instrumentation;
    private dashboard: DashboardServer;

    constructor({ encryption: { key, fields = config.DEFAULT_FIELDS_TO_ENCRYPT } }: IServerDevlToolsParams) {
        this.instrumentation = new Instrumentation();
        this.dashboard = new DashboardServer(this.instrumentation.traceStore, this.instrumentation.traceMetadataStore,);
    }

    async start() {
        await this.instrumentation.start();
        // await this.dashboard.start(3001);
    }

    handle(req: IncomingMessage, res: ServerResponse) {
        return this.dashboard.handle(req, res);
    }

    middleware(req: IncomingMessage, res: ServerResponse) {
        if (req?.url?.startsWith("/_devtools") === true) {
            //maybe call the handle func
            this.handle(req, res);
            return;
        }


        const activeSpan = trace.getSpan(context.active());
        const traceId = activeSpan?.spanContext().traceId;
        if (!traceId) {

            return;
        }
        const chunks = []

        console.log("ACTIVE TRACE ID:", traceId);

        const traceMetadataStore =
            this.instrumentation.traceMetadataStore;

        const originalWriteFunc = res.write;

        res.write = function (...args) {
            const chunk = args[0];


            if (Buffer.isBuffer(chunk)) {
                const pureText = chunk.toString("utf8")
                console.log(
                    "RESPONSE BODY (res.write):",
                    pureText
                );
                chunks.push(pureText)
            } else {
                console.log(
                    "RESPONSE BODY (res.write):",
                    chunk
                );

                chunks.push(chunk)
            }

            return originalWriteFunc.apply(this, args);
        };

        const originalEndFunc = res.end;
        res.end = function (...args) {
            const chunk = args[0];

            if (Buffer.isBuffer(chunk)) {
                const pureText = chunk.toString("utf8")

                console.log(
                    "RESPONSE BODY (res.end):",
                    pureText
                );

                chunks.push(pureText)
            } else if (typeof chunk === "string") {
                console.log(
                    "RESPONSE BODY (res.end):",
                    chunk
                );

                chunks.push(chunk)
            }

            traceMetadataStore.setResponseBody(traceId, chunks.join(""))
            return originalEndFunc.apply(this, args);
        };


    }

    async shutdown() {
        // await this.dashboard.stop();
        await this.instrumentation.shutdown();
    }

}


export default ServerDevTools;