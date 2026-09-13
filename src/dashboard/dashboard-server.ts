import { IncomingMessage, ServerResponse } from "node:http";
import Config from "../config";
import ExecutionTreeBuilder from "../core/execution-tree-builder";
import SQLiteStorage from "../storage/sqlite-storage";
import DashboardErrorMapper from "./dashboard-errors-mapper";
import DashboardRequestDetailMapper from "./dashboard-request-detail-mapper";
import DashboardResponseDetailMapper from "./dashboard-response-detail-mapper";


export default class DashboardServer {
    private readonly executionTreeBuilder = new ExecutionTreeBuilder();
    private readonly requestDetailMapper = new DashboardRequestDetailMapper();
    private readonly responseDetailMapper = new DashboardResponseDetailMapper()
    private readonly errorMapper = new DashboardErrorMapper()
    // private server?: Server;


    constructor(
        private readonly storage: SQLiteStorage,
    ) {
    }

    handle(req: IncomingMessage,
        res: ServerResponse,) {
        const requestUrl = req.url ?? '';
        const pathname = requestUrl.split('?')[0];

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

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(request));
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

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(response));
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

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(trace));
            return;
        }

        if (
            req.method === Config.REQUEST_METHOD.GET &&
            pathname === Config.DASHBOARD_API_ROUTES.REQUESTS) {
            const requests = this.storage
                .getTraceSummaries()
                .map(summary => ({
                    id: summary.traceId,
                    method: summary.method ?? "UNKNOWN",
                    path: summary.path ?? "",
                    route: summary.route,
                    statusCode: summary.statusCode,
                    durationMs: summary.durationMs,
                    startedAt: summary.startedAt,
                    hasError: summary.hasError,
                }));

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(requests))
            return;
        }


        res.statusCode = 404;
        res.end("Not Found");
    }


}
