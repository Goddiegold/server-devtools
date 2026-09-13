// import { Instrumentation } from "./instumentations/instrumentation";

import { context, trace } from "@opentelemetry/api";
import { IncomingMessage, ServerResponse } from "node:http";
import DashboardServer from "./dashboard/dashboard-server";
import { Instrumentation } from "./instrumentation/instrumentation";
import { IServerDevlToolsParams } from "./types";
import SQLiteStorage from "./storage/sqlite-storage";
import EncryptDecryptService from "./security/encrypt-decrypt.service";
import Config from "./config";
import AuthService from "./security/auth.service";

class ServerDevTools {
    private instrumentation: Instrumentation;
    private dashboard: DashboardServer;
    private storage: SQLiteStorage
    private authService: AuthService

    constructor(
        options: IServerDevlToolsParams
    ) {
        const encryptionService = options.encryption
            ? new EncryptDecryptService(
                options.encryption.key,
                options.encryption.fields ?? Config.DEFAULT_FIELDS_TO_ENCRYPT,
            )
            : undefined;

        this.storage = new SQLiteStorage(
            "./server-devtools.db",
            encryptionService,
        );

        const auth = options.auth || {}

        if (!auth?.username || !auth?.password) {
            throw new Error(
                "ServerDevTools auth username and password are required",
            );
        }

        this.authService = new AuthService(auth.username, auth.password, this.storage)

        this.instrumentation = new Instrumentation(this.storage);
        this.dashboard = new DashboardServer(
            this.storage,
            this.authService
        );
    }

    async start() {
        await this.instrumentation.start();
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

        const storage = this.storage

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


            const rawBody = chunks.join("");

            const contentType = res.getHeader("content-type");
            let body = rawBody

            if (typeof contentType === 'string' && contentType.includes("application/json")) {
                try {
                    body = JSON.parse(rawBody);
                } catch (e) {

                }
            }

            storage.saveResponseBody(traceId, body)
            return originalEndFunc.apply(this, args);
        };


    }

    async shutdown() {
        await this.instrumentation.shutdown();
    }

}


export default ServerDevTools;
