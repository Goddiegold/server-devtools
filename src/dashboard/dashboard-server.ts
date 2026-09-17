import { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Config from "../config";
import ExecutionTreeBuilder from "../core/execution-tree-builder";
import SQLiteStorage from "../storage/sqlite-storage";
import DashboardErrorMapper from "./dashboard-errors-mapper";
import DashboardRequestDetailMapper from "./dashboard-request-detail-mapper";
import DashboardResponseDetailMapper from "./dashboard-response-detail-mapper";
import AuthService from "../security/auth.service";
import { ISession } from "../types";

const sourceBuildDashboardDirectory = path.resolve(__dirname, "../../dist/dashboard");
const dashboardDirectory = existsSync(path.join(sourceBuildDashboardDirectory, "index.html"))
    ? sourceBuildDashboardDirectory
    : path.resolve(__dirname, "../../dashboard");
const contentTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".json": "application/json; charset=utf-8",
};


export default class DashboardServer {
    private readonly executionTreeBuilder = new ExecutionTreeBuilder();
    private readonly requestDetailMapper = new DashboardRequestDetailMapper();
    private readonly responseDetailMapper = new DashboardResponseDetailMapper()
    private readonly errorMapper = new DashboardErrorMapper()
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

    private async handleLogin(req: IncomingMessage,
        res: ServerResponse) {
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


        const token = this.authService.createSession(username)
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
            this.storage.clearHistory();
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
            if (!this.storage.getTrace(traceId)) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            this.storage.deleteTrace(traceId);
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


            //  const trace = this.storage.getTrace(traceId)
            const trace = this.storage.getTrace(traceId)

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

            const trace = this.storage.getTrace(traceId)
            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            const metadata = this.storage.getTraceMetadata(traceId)
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

            const trace = this.storage.getTrace(traceId)
            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            const metadata = this.storage.getTraceMetadata(traceId)
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

            const trace = this.storage.getTrace(traceId)

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

                const trace = this.storage.getTrace(traceId);

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

                const details = this.storage.getHttpClientDetails(spanId);

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

            const trace = this.storage.getTrace(traceId)

            if (!trace) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Trace not found",
                }));
                return;
            }

            const metadata = this.storage.getTraceMetadata(traceId);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ...trace, user: metadata?.user }));
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

            if (page === undefined || limit === undefined || limit > 100) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    message: "Page must be a positive integer and limit must be between 1 and 100",
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

            const { summaries, total } = this.storage.getPaginatedTraceSummaries(page, limit);
            const data = summaries.map(summary => ({
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
                res.setHeader("Content-Type", contentTypes[path.extname(filePath)] ?? "application/octet-stream");
                res.end(content);
                return;
            } catch {
                res.statusCode = 404;
                res.end("Not Found");
                return;
            }
        }


        res.statusCode = 404;
        res.end("Not Found");
    }


}
