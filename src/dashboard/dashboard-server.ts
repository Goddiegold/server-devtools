import { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Config from "../config";
import ExecutionTreeBuilder from "../core/execution-tree-builder";
import SQLiteStorage, {
    type TraceSummarySortDirection,
    type TraceSummarySortField,
} from "../storage/sqlite-storage";
import DashboardErrorMapper from "./dashboard-errors-mapper";
import DashboardRequestDetailMapper from "./dashboard-request-detail-mapper";
import DashboardResponseDetailMapper from "./dashboard-response-detail-mapper";
import AuthService from "../security/auth.service";
import { ISession } from "../types";
import { debugLog } from "../utils/logger";
import { normalizeRemoteAddress } from "../utils/helpers";
import {
    RateLimiterMemory,
    RateLimiterRes,
} from "rate-limiter-flexible";

const sourceBuildDashboardDirectory = path.resolve(__dirname, "../../dist/dashboard");
const dashboardDirectory = existsSync(path.join(sourceBuildDashboardDirectory, "index.html"))
    ? sourceBuildDashboardDirectory
    : path.resolve(__dirname, "../../dashboard");
const MAX_TRACKED_LOGIN_RATE_LIMIT_KEYS = 1_000;

export default class DashboardServer {
    private readonly executionTreeBuilder = new ExecutionTreeBuilder();
    private readonly requestDetailMapper = new DashboardRequestDetailMapper();
    private readonly responseDetailMapper = new DashboardResponseDetailMapper()
    private readonly errorMapper = new DashboardErrorMapper()
    private readonly loginRateLimiter = new RateLimiterMemory({
        keyPrefix: "server-devtools-dashboard-login",
        points: Config.DASHBOARD_LOGIN_RATE_LIMIT.POINTS,
        duration: Config.DASHBOARD_LOGIN_RATE_LIMIT.DURATION_SECONDS,
        blockDuration: Config.DASHBOARD_LOGIN_RATE_LIMIT.BLOCK_SECONDS,
    });
    private readonly trackedLoginRateLimitKeys = new Map<string, number>();
    private maxTrackedLoginRateLimitKeys = MAX_TRACKED_LOGIN_RATE_LIMIT_KEYS;
    // private server?: Server;


    constructor(
        private readonly storage: SQLiteStorage,
        private readonly authService: AuthService
    ) {
    }

    private readJsonBody(
        req: IncomingMessage,
    ): Promise<unknown> {
        return new Promise((resolve, reject) => {
            let body = "";

            req.on("data", (chunk) => {
                body += chunk.toString();
            });

            req.on("end", () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(error);
                }
            });

            req.on("error", reject);
        });
    }

    private getCookie(
        req: IncomingMessage,
        name: string,
    ): string | undefined {
        const cookieHeader = req.headers.cookie;

        if (!cookieHeader) return undefined;

        const cookies = cookieHeader.split(";");

        for (const cookie of cookies) {
            const [key, ...valueParts] = cookie.trim().split("=");

            if (key === name) {
                return decodeURIComponent(valueParts.join("="));
            }
        }

        return undefined;
    }

    private authenticateRequest(
        req: IncomingMessage,
        res: ServerResponse,
    ): ISession | undefined {
        const token = this.getCookie(req, "sdt_session");

        if (!token) {
            this.sendUnauthorized(res);
            return undefined;
        }

        const session = this.authService.getSession(token);

        if (!session) {
            this.sendUnauthorized(res);
            return undefined;
        }

        return session;
    }

    private sendUnauthorized(res: ServerResponse): void {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");

        res.end(JSON.stringify({
            message: "Unauthorized",
        }));
        return;
    }

    private reclaimExpiredLoginRateLimitKeys(now: number): void {
        for (const [key, expiresAt] of this.trackedLoginRateLimitKeys) {
            if (expiresAt <= now) {
                this.trackedLoginRateLimitKeys.delete(key);
            }
        }
    }

    private getLoginRateLimitCapacityRetryAfterMs(now: number): number {
        let earliestExpiry = Number.POSITIVE_INFINITY;

        for (const expiresAt of this.trackedLoginRateLimitKeys.values()) {
            earliestExpiry = Math.min(earliestExpiry, expiresAt);
        }

        if (!Number.isFinite(earliestExpiry)) {
            return Config.DASHBOARD_LOGIN_RATE_LIMIT.DURATION_SECONDS * 1000;
        }

        return Math.max(1, earliestExpiry - now);
    }

    private trackLoginRateLimitKey(
        key: string,
        msBeforeNext: number,
        now = Date.now(),
    ): void {
        this.trackedLoginRateLimitKeys.set(
            key,
            now + Math.max(1, msBeforeNext),
        );
    }

    private sendLoginRateLimitResponse(
        res: ServerResponse,
        msBeforeNext: number,
    ): void {
        res.statusCode = 429;
        res.setHeader("Retry-After", Math.max(
            1,
            Math.ceil(msBeforeNext / 1000),
        ));
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({
            message: "Too many login attempts",
        }));
    }

    private async handleLogin(req: IncomingMessage,
        res: ServerResponse) {
        const rateLimitKey = normalizeRemoteAddress(req.socket.remoteAddress);
        const now = Date.now();
        this.reclaimExpiredLoginRateLimitKeys(now);

        const wasTracked = this.trackedLoginRateLimitKeys.has(rateLimitKey);
        if (!wasTracked) {
            if (this.trackedLoginRateLimitKeys.size >= this.maxTrackedLoginRateLimitKeys) {
                this.sendLoginRateLimitResponse(
                    res,
                    this.getLoginRateLimitCapacityRetryAfterMs(now),
                );
                return;
            }

            this.trackLoginRateLimitKey(
                rateLimitKey,
                Config.DASHBOARD_LOGIN_RATE_LIMIT.DURATION_SECONDS * 1000,
                now,
            );
        }

        try {
            const consumeResult = await this.loginRateLimiter.consume(rateLimitKey);
            this.trackLoginRateLimitKey(
                rateLimitKey,
                consumeResult.msBeforeNext,
            );
        } catch (error) {
            if (error instanceof RateLimiterRes) {
                this.trackLoginRateLimitKey(
                    rateLimitKey,
                    error.msBeforeNext,
                );
                this.sendLoginRateLimitResponse(res, error.msBeforeNext);
                return;
            }

            if (!wasTracked) {
                this.trackedLoginRateLimitKeys.delete(rateLimitKey);
            }

            debugLog("Dashboard login rate-limit failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({
                message: "Unable to process login request",
            }));
            return;
        }

        const body = await this.readJsonBody(req) as {
            username?: string;
            password?: string;
        } | null;

        const username = body?.username || null
        const password = body?.password || null

        if (!username || !password) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                message: "Password and Username are required!",
            }));
            return;
        }


        const valid = this.authService.validateCredentials(username, password)
        if (!valid) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                message: "Invalid Auth Credentials",
            }));
            return;
        }


        let token: string;

        try {
            token = this.authService.createSession(username)
        } catch (error) {
            debugLog("Session creation failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ message: "Unable to create session" }));
            return;
        }

        try {
            const rewardResult = await this.loginRateLimiter.reward(rateLimitKey, 1);
            this.trackLoginRateLimitKey(
                rateLimitKey,
                rewardResult.msBeforeNext,
            );
        } catch (error) {
            debugLog("Dashboard login rate-limit refund failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
            "Set-Cookie",
            `sdt_session=${token}; HttpOnly; SameSite=Strict; Path=/_devtools`,
        );
        res.setHeader("Cache-Control", "no-store");

        res.end(JSON.stringify({
            username,
        }));
        return;
    }

    private handleLogout(
        req: IncomingMessage,
        res: ServerResponse,
    ): void {
        const token = this.getCookie(req, "sdt_session");

        if (token) {
            this.authService.deleteSession(token);
        }

        res.setHeader(
            "Set-Cookie",
            "sdt_session=; HttpOnly; SameSite=Strict; Path=/_devtools; Max-Age=0",
        );

        res.setHeader("Cache-Control", "no-store");
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            message: "Logout Successfully!",
        }));
    }

    private handleProfile(
        req: IncomingMessage,
        res: ServerResponse,
    ): void {
        const token = this.getCookie(req, "sdt_session");

        if (!token) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                message: "Unauthorized",
            }));
            return;
        }

        const session = this.authService.getSession(token);

        if (!session) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                message: "Unauthorized",
            }));
            return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");

        res.end(JSON.stringify({
            username: session.username,
        }));
    }

    handle(req: IncomingMessage,
        res: ServerResponse,) {
        const requestUrl = req.url ?? '';
        const pathname = requestUrl.split('?')[0];

        if (
            req.method === "POST" &&
            pathname === `${Config.DASHBOARD_API_ROUTES.AUTH}/login`
        ) {
            return this.handleLogin(req, res);
        }


        // Everything under /_devtools/api from here requires auth
        if (pathname.startsWith("/_devtools/api/")) {
            const session = this.authenticateRequest(req, res);

            if (!session) {
                return;
            }
        }

        if (
            req.method === "POST" &&
            pathname === `${Config.DASHBOARD_API_ROUTES.AUTH}/logout`
        ) {
            return this.handleLogout(req, res);
        }

        if (
            req.method === "GET" &&
            pathname === `${Config.DASHBOARD_API_ROUTES.AUTH}/profile`
        ) {
            return this.handleProfile(req, res);
        }

        if (
            req.method === Config.REQUEST_METHOD.DELETE &&
            pathname === Config.DASHBOARD_API_ROUTES.TRACES
        ) {
            try {
                this.storage.clearHistory();
            } catch (error) {
                debugLog("History clear failed", {
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to clear history" }));
                return;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                message: "Cleared history successfully!",
            }));
            return;
        }

        if (
            req.method === Config.REQUEST_METHOD.DELETE &&
            pathname.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`)
        ) {
            const traceId = decodeURIComponent(pathname.slice(
                `${Config.DASHBOARD_API_ROUTES.TRACES}/`.length
            ));
            let traceExists: ReturnType<SQLiteStorage["getTrace"]>;

            try {
                traceExists = this.storage.getTrace(traceId);
            } catch (error) {
                debugLog("Trace lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace" }));
                return;
            }

            if (!traceExists) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            try {
                this.storage.deleteTrace(traceId);
            } catch (error) {
                debugLog("Trace deletion failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to delete trace" }));
                return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                message: "Deleted successfully!",
            }));
            return;
        }

        if (req.method === Config.REQUEST_METHOD.GET &&
            req.url?.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`) &&
            req.url.endsWith("/execution")) {
            const prefix = `${Config.DASHBOARD_API_ROUTES.TRACES}/`;


            const traceId = req.url
                .slice(prefix.length)
                .replace(/\/execution$/, "");


            let trace: ReturnType<SQLiteStorage["getTrace"]>;

            try {
                trace = this.storage.getTrace(traceId)
            } catch (error) {
                debugLog("Trace lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace" }));
                return;
            }

            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            const executionTree = this.executionTreeBuilder.build(trace);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(executionTree));
            return;
        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            req.url?.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`) &&
            req.url.endsWith("/request")
        ) {
            const prefix = `${Config.DASHBOARD_API_ROUTES.TRACES}/`;

            const traceId = req.url
                .slice(prefix.length)
                .replace(/\/request$/, "");

            let trace: ReturnType<SQLiteStorage["getTrace"]>;

            try {
                trace = this.storage.getTrace(traceId)
            } catch (error) {
                debugLog("Trace lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace" }));
                return;
            }
            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            let metadata: ReturnType<SQLiteStorage["getTraceMetadata"]>;

            try {
                metadata = this.storage.getTraceMetadata(traceId)
            } catch (error) {
                debugLog("Trace metadata lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace metadata" }));
                return;
            }
            const request = this.requestDetailMapper.map(trace, metadata);
            const user = metadata?.user;

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({...request, user}));
            return;

        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            req.url?.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`) &&
            req.url.endsWith("/response")
        ) {
            const prefix = `${Config.DASHBOARD_API_ROUTES.TRACES}/`;

            const traceId = req.url
                .slice(prefix.length)
                .replace(/\/response$/, "");

            let trace: ReturnType<SQLiteStorage["getTrace"]>;

            try {
                trace = this.storage.getTrace(traceId)
            } catch (error) {
                debugLog("Trace lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace" }));
                return;
            }
            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            let metadata: ReturnType<SQLiteStorage["getTraceMetadata"]>;

            try {
                metadata = this.storage.getTraceMetadata(traceId)
            } catch (error) {
                debugLog("Trace metadata lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace metadata" }));
                return;
            }
            const response = this.responseDetailMapper.map(trace, metadata)
      const user = metadata?.user;

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({...response, user}));
            return;

        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            req.url?.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`) &&
            req.url.endsWith("/errors")
        ) {

            const prefix = `${Config.DASHBOARD_API_ROUTES.TRACES}/`;

            const traceId = req.url
                .slice(prefix.length)
                .replace(/\/errors$/, "");

            let trace: ReturnType<SQLiteStorage["getTrace"]>;

            try {
                trace = this.storage.getTrace(traceId)
            } catch (error) {
                debugLog("Trace lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace" }));
                return;
            }

            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            const errors = this.errorMapper.map(trace)
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(errors));
            return;

        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            pathname.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`)
        ) {
            const prefix = `${Config.DASHBOARD_API_ROUTES.TRACES}/`;
            const segments = pathname.slice(prefix.length).split("/");

            if (segments[1] === "http-client") {
                let traceId: string;
                let spanId: string;

                if (segments.length !== 3) {
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        message: "Trace and span identifiers are required",
                    }));
                    return;
                }

                try {
                    traceId = decodeURIComponent(segments[0]);
                    spanId = decodeURIComponent(segments[2]);
                } catch {
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        message: "Invalid trace or span identifier",
                    }));
                    return;
                }

                if (!traceId || !spanId) {
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        message: "Trace and span identifiers are required",
                    }));
                    return;
                }

                let trace: ReturnType<SQLiteStorage["getTrace"]>;

                try {
                    trace = this.storage.getTrace(traceId);
                } catch (error) {
                    debugLog("Trace lookup failed", {
                        traceId,
                        errorName: error instanceof Error ? error.name : typeof error,
                    });
                    res.statusCode = 500;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ message: "Unable to read trace" }));
                    return;
                }

                if (!trace) {
                    res.statusCode = 404;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        message: "Trace not found",
                    }));
                    return;
                }

                const span = trace.spans.find(candidate => candidate.spanId === spanId);

                if (!span) {
                    res.statusCode = 404;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        message: "Span not found",
                    }));
                    return;
                }

                if (span.type !== "http.client") {
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        message: "Span is not an HTTP client span",
                    }));
                    return;
                }

                let details: ReturnType<SQLiteStorage["getHttpClientDetails"]>;

                try {
                    details = this.storage.getHttpClientDetails(spanId);
                } catch (error) {
                    debugLog("HTTP client details lookup failed", {
                        spanId,
                        errorName: error instanceof Error ? error.name : typeof error,
                    });
                    res.statusCode = 500;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ message: "Unable to read HTTP client details" }));
                    return;
                }

                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    span,
                    ...(details ? { details } : {}),
                }));
                return;
            }
        }


        if (
            req.method === Config.REQUEST_METHOD.GET &&
            pathname.startsWith(`${Config.DASHBOARD_API_ROUTES.TRACES}/`)
        ) {
            const traceId = decodeURIComponent(pathname.slice(
                `${Config.DASHBOARD_API_ROUTES.TRACES}/`.length
            ));

            let trace: ReturnType<SQLiteStorage["getTrace"]>;

            try {
                trace = this.storage.getTrace(traceId)
            } catch (error) {
                debugLog("Trace lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace" }));
                return;
            }

            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            let metadata: ReturnType<SQLiteStorage["getTraceMetadata"]>;

            try {
                metadata = this.storage.getTraceMetadata(traceId);
            } catch (error) {
                debugLog("Trace metadata lookup failed", {
                    traceId,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace metadata" }));
                return;
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ...trace, user: metadata?.user }));
            return;
        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            pathname === Config.DASHBOARD_API_ROUTES.OVERVIEW
        ) {
            res.setHeader("Cache-Control", "no-store");
            const searchParams = new URL(requestUrl, "http://localhost").searchParams;
            const requestedRange = searchParams.get("range") ?? "1h";
            const validRanges = ["15m", "1h", "6h", "24h"] as const;

            if (!(validRanges as readonly string[]).includes(requestedRange)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Range must be one of 15m, 1h, 6h, or 24h",
                }));
                return;
            }

            try {
                const overview = this.storage.getOverview(requestedRange as typeof validRanges[number]);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(overview));
            } catch (error) {
                debugLog("Overview lookup failed", {
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read overview" }));
            }
            return;
        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            pathname === Config.DASHBOARD_API_ROUTES.REQUESTS) {
            const searchParams = new URL(requestUrl, "http://localhost").searchParams;
            const parsePositiveInteger = (name: string, fallback: number) => {
                const value = searchParams.get(name);
                if (value === null) {
                    return fallback;
                }

                if (!/^\d+$/.test(value)) {
                    return undefined;
                }

                const parsed = Number(value);
                return Number.isSafeInteger(parsed) && parsed > 0
                    ? parsed
                    : undefined;
            };
            const page = parsePositiveInteger("page", 1);
            const limit = parsePositiveInteger("limit", 20);
            const search = searchParams.get("search") ?? "";
            const method = searchParams.get("method")?.trim().toUpperCase() || undefined;
            const statusValue = searchParams.get("status");
            const parseTimestamp = (name: string) => {
                const value = searchParams.get(name);
                if (value === null || value === "") {
                    return undefined;
                }

                if (!/^\d+$/.test(value)) {
                    return undefined;
                }

                const parsed = Number(value);
                return Number.isSafeInteger(parsed) ? parsed : undefined;
            };
            const fromValue = searchParams.get("from");
            const toValue = searchParams.get("to");
            const startedAtFrom = parseTimestamp("from");
            const startedAtTo = parseTimestamp("to");
            const sortByValue = searchParams.get("sortBy");
            const sortDirectionValue = searchParams.get("sortDirection");
            const sortFields: TraceSummarySortField[] = [
                "startedAt",
                "durationMs",
                "statusCode",
                "method",
                "path",
            ];
            const sortField = sortByValue === null || sortByValue === ""
                ? "startedAt"
                : sortFields.includes(sortByValue as TraceSummarySortField)
                    ? sortByValue as TraceSummarySortField
                    : undefined;
            const sortDirection = sortDirectionValue === null || sortDirectionValue === ""
                ? "desc"
                : sortDirectionValue === "asc" || sortDirectionValue === "desc"
                    ? sortDirectionValue as TraceSummarySortDirection
                    : undefined;
            const statusCode = statusValue === null || statusValue === ""
                ? undefined
                : /^\d+$/.test(statusValue)
                    ? Number(statusValue)
                    : undefined;

            if (
                page === undefined ||
                limit === undefined ||
                limit > 100 ||
                (statusValue !== null && statusValue !== "" &&
                    (statusCode === undefined || statusCode < 100 || statusCode > 599)) ||
                (fromValue !== null && fromValue !== "" && startedAtFrom === undefined) ||
                (toValue !== null && toValue !== "" && startedAtTo === undefined) ||
                (startedAtFrom !== undefined && startedAtTo !== undefined && startedAtFrom > startedAtTo) ||
                sortField === undefined ||
                sortDirection === undefined
            ) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Page, date filters, and sorting must be valid, limit must be between 1 and 100, and from must not be after to",
                }));
                return;
            }

            if (!Number.isSafeInteger((page - 1) * limit)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Page is out of range",
                }));
                return;
            }

            let summaries: ReturnType<SQLiteStorage["getPaginatedTraceSummaries"]>;

            try {
                summaries = this.storage.getPaginatedTraceSummaries(
                    page,
                    limit,
                    search,
                    method,
                    statusCode,
                    startedAtFrom,
                    startedAtTo,
                    sortField,
                    sortDirection,
                );
            } catch (error) {
                debugLog("Trace summary lookup failed", {
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Unable to read trace summaries" }));
                return;
            }

            const { summaries: traceSummaries, total } = summaries;
            const data = traceSummaries.map(summary => ({
                    id: summary.traceId,
                    method: summary.method ?? "UNKNOWN",
                    path: summary.path ?? "",
                    route: summary.route,
                    statusCode: summary.statusCode,
                    durationMs: summary.durationMs,
                    startedAt: summary.startedAt,
                    hasError: summary.hasError,
                    user: summary.user,
                }));
            const totalPages = Math.ceil(total / limit);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasMore: page < totalPages,
                },
            }));
            return;
        }

        if (
            req.method === "GET" &&
            (pathname === "/_devtools" || pathname.startsWith("/_devtools/")) &&
            !pathname.startsWith("/_devtools/api/") &&
            pathname !== "/_devtools/api"
        ) {
            const relativePath = pathname === "/_devtools" || pathname === "/_devtools/"
                ? "index.html"
                : pathname.slice("/_devtools/".length);

            try {
                const decodedPath = decodeURIComponent(relativePath);
                const filePath = path.resolve(dashboardDirectory, decodedPath);
                if (filePath !== dashboardDirectory && !filePath.startsWith(`${dashboardDirectory}${path.sep}`)) {
                    res.statusCode = 404;
                    res.end("Not Found");
                    return;
                }

                const content = readFileSync(filePath);
                res.statusCode = 200;
                res.setHeader("Content-Type", Config.DASHBOARD_CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream");
                res.end(content);
                return;
            } catch {
                if (path.extname(relativePath) === "") {
                    try {
                        const content = readFileSync(path.join(dashboardDirectory, "index.html"));
                        res.statusCode = 200;
                        res.setHeader("Content-Type", Config.DASHBOARD_CONTENT_TYPES[".html"]);
                        res.end(content);
                        return;
                    } catch {
                        // Fall through to the normal 404 response.
                    }
                }
                res.statusCode = 404;
                res.end("Not Found");
                return;
            }
        }


        res.statusCode = 404;
        res.end("Not Found");
    }


}
