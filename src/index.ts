import { context, trace } from "@opentelemetry/api";
import { IncomingMessage, ServerResponse } from "node:http";
import Config from "./config";
import DashboardServer from "./dashboard/dashboard-server";
import { Instrumentation } from "./instrumentation/instrumentation";
import AuthService from "./security/auth.service";
import EncryptDecryptService from "./security/encrypt-decrypt.service";
import PgStorage from "./storage/pg-storage";
import SQLiteStorage from "./storage/sqlite-storage";
import type { IStorage } from "./types";
import { IServerDevlToolsParams, SUPPORTED_DB } from "./types";
import { debugLog } from "./utils/logger";

class ServerDevTools {
    private instrumentation: Instrumentation;
    private dashboard: DashboardServer;
    private storage: IStorage
    private authService: AuthService
    private readonly getCurrentUser?: IServerDevlToolsParams["getCurrentUser"];

    constructor(
        options: IServerDevlToolsParams
    ) {
        const encryptionService = options.encryption
            ? new EncryptDecryptService(
                options.encryption.key,
                options.encryption.fields ?? Config.DEFAULT_FIELDS_TO_ENCRYPT,
            )
            : undefined;

        const db = options.db;

        if (!db) {
            this.storage = new SQLiteStorage(
                "./server-devtools.db",
                encryptionService,
            );
        } else {
            switch (db.provider) {
                case SUPPORTED_DB.postgresql:
                    if (!db.connectionString?.trim()) {
                        throw new Error(
                            "PostgreSQL storage requires a connectionString",
                        );
                    }

                    this.storage = new PgStorage(
                        db.connectionString,
                        encryptionService,
                    );
                    break;

                default:
                    throw new Error(
                        `Unsupported storage provider: ${db.provider}`,
                    );
            }
        }

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

        this.getCurrentUser = options.getCurrentUser;
    }

    async start() {
        await this.instrumentation.start();
    }

    handle(req: IncomingMessage, res: ServerResponse) {
        return this.dashboard.handle(req, res);
    }

    middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
        if (req?.url?.startsWith("/_devtools") === true) {
            //maybe call the handle func
            this.handle(req, res);
            return;
        }


        const activeSpan = trace.getSpan(context.active());
        const traceId = activeSpan?.spanContext().traceId;

        if (traceId) {
            const chunks: unknown[] = []

            debugLog("Attached inbound response capture", { traceId });

            const storage = this.storage

            const originalWriteFunc = res.write;

            res.write = (function (this: ServerResponse, ...args: Parameters<typeof originalWriteFunc>) {
                const chunk = args[0];


                if (Buffer.isBuffer(chunk)) {
                    const pureText = chunk.toString("utf8")
                    chunks.push(pureText)
                } else {
                    chunks.push(chunk)
                }

                return originalWriteFunc.apply(this, args);
            }) as typeof res.write;

            const originalEndFunc = res.end;
            res.end = (function (this: ServerResponse, ...args: Parameters<typeof originalEndFunc>) {
                const chunk = args[0];

                if (Buffer.isBuffer(chunk)) {
                    const pureText = chunk.toString("utf8")

                    chunks.push(pureText)
                } else if (typeof chunk === "string") {
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

                try {
                    void storage.saveResponseBody(traceId, body).catch((error) => {
                        debugLog("Response body capture failed", {
                            traceId,
                            errorName: error instanceof Error ? error.name : typeof error,
                        });
                    });
                } catch (error) {
                    debugLog("Response body capture failed", {
                        traceId,
                        errorName: error instanceof Error ? error.name : typeof error,
                    });
                }
                return originalEndFunc.apply(this, args);
            }) as typeof res.end;

            if (this.getCurrentUser) {
                res.once("finish", () => {
                    try {
                        const user = this.getCurrentUser?.(req);
                        void this.storage.saveCurrentUser(traceId, user!).catch((error) => {
                            debugLog("Current user capture failed", {
                                traceId,
                                errorName: error instanceof Error ? error.name : typeof error,
                            });
                        });
                    } catch (error) {
                        debugLog("Current user capture failed", {
                            traceId,
                            errorName: error instanceof Error ? error.name : typeof error,
                        });
                    }
                });
            }
        }


        next()
    }

    async shutdown() {
        await this.instrumentation.shutdown();
    }

}


export default ServerDevTools;
